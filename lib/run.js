import { input, select } from '@inquirer/prompts'
import {
	baseUrl,
	isValidJSON,
	detectInput,
	validateJSON,
	makeAuthenticatedRequest,
	formatOutput,
	handleError,
	getRefreshToken,
	checkRefreshTokenExpiration,
	renewRefreshToken,
	getAccessToken
} from './utils.js'

/**
 * Makes authenticated request to ConnexCS API with optional SSE log streaming
 * @param {string} id - ScriptForge ID, UUID, or filename (without extension)
 * @param {Object} requestBody - JSON body for the request
 * @param {boolean} silent - Whether to suppress progress output
 * @param {string} [fn] - Optional function name to execute
 * @param {Object} sseOptions - SSE streaming options
 * @param {boolean} sseOptions.enabled - Whether to use SSE streaming
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function executeScriptForge(id, requestBody, silent = false, fn = null, sseOptions = { enabled: true }) {
	// Get the APP_ID from environment - required for the new endpoint format
	const appId = process.env.APP_ID
	if (!appId) {
		return { success: false, error: 'No APP_ID configured. Use "cx configure:app" first.' }
	}
	
	// Build endpoint: scriptforge/:appId/:id/:fn?
	const endpoint = fn ? `scriptforge/${appId}/${id}/${fn}` : `scriptforge/${appId}/${id}`
	
	if (!silent) {
		console.log(`🚀 Executing ScriptForge ID: ${id}${fn ? ` (function: ${fn})` : ''}`)
		console.log(`📡 URL: ${baseUrl}${endpoint}`)
	}
	
	// If SSE is disabled or silent mode, use regular request
	if (!sseOptions.enabled || silent) {
		return makeAuthenticatedRequest(endpoint, 'POST', requestBody, silent)
	}
	
	// Use SSE streaming for logs
	return executeWithSSE(endpoint, requestBody, silent)
}

/**
 * Executes ScriptForge with SSE log streaming
 * @param {string} endpoint - API endpoint
 * @param {Object} requestBody - JSON body for the request
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function executeWithSSE(endpoint, requestBody, silent) {
	const url = `${baseUrl}${endpoint}`
	
	// Create abort controller for timeout
	const controller = new AbortController()
	let timeoutId = null
	
	try {
		// Get refresh token
		let refreshToken = getRefreshToken()
		
		// Check if token needs renewal (less than 15 days remaining)
		const { needsRenewal } = checkRefreshTokenExpiration(refreshToken)
		if (needsRenewal) {
			try {
				refreshToken = await renewRefreshToken(refreshToken, silent)
			} catch (error) {
				// If renewal fails, continue with old token and let it fail naturally
				if (!silent) {
					console.warn('⚠️  Continuing with existing token...')
				}
			}
		}
		
		// Exchange refresh token for access token
		const accessToken = await getAccessToken(refreshToken)
		
		if (!silent) {
			console.log('🔑 POST', endpoint)
			console.log('📺 Streaming logs via SSE...')
			console.log('─'.repeat(50))
		}
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'Accept': 'text/event-stream'
			},
			body: JSON.stringify(requestBody),
			signal: controller.signal
		})
		
		if (!response.ok) {
			const responseText = await response.text()
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`
			
			const contentType = response.headers.get('content-type') || ''
			if (contentType.includes('application/json') && isValidJSON(responseText)) {
				try {
					const errorData = JSON.parse(responseText)
					if (errorData.error || errorData.message) {
						errorMessage = errorData.error || errorData.message
					}
				} catch (e) {
					if (responseText) {
						errorMessage = responseText
					}
				}
			} else if (responseText && !responseText.includes('<!DOCTYPE html>')) {
				errorMessage = responseText
			}
			
			return { success: false, error: errorMessage }
		}
		
		// Parse SSE stream, pass controller so stream can be aborted when done
		return await parseSSEStream(response, silent, controller)
		
	} catch (error) {
		if (timeoutId) clearTimeout(timeoutId)
		if (error.name === 'AbortError') {
			return { success: false, error: 'Request timed out' }
		}
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Parses Server-Sent Events stream for logs and result
 * @param {Response} response - Fetch response object
 * @param {boolean} silent - Whether to suppress progress output
 * @param {AbortController} controller - Abort controller to cancel the request
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function parseSSEStream(response, silent, controller) {
	return new Promise(async (resolve) => {
		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		let result = null
		let resultReceived = false
		let logCount = 0
		let resolved = false
		let dataReceived = false
		
		// Create a promise that can be resolved externally to break out of read loop
		let resolveFinished
		const finishedPromise = new Promise((resolve) => {
			resolveFinished = resolve
		})
		
		const finishWithResult = () => {
			if (resolved) return
			resolved = true
			
			// Signal the read loop to exit
			resolveFinished()
			
			// Cancel the reader first
			reader.cancel().catch(() => {})
			
			// Abort the fetch to close the connection
			if (controller) {
				controller.abort()
			}
			
			if (!silent) {
				console.log('─'.repeat(50))
				console.log(`📊 Logs received: ${logCount}`)
			}
			
			if (result !== null) {
				// Determine content type
				let contentType = 'json'
				if (typeof result === 'string') {
					if (isValidJSON(result)) {
						result = JSON.parse(result)
					} else {
						contentType = 'text'
					}
				}
				resolve({ success: true, data: result, contentType })
			} else {
				resolve({ success: true, data: {}, contentType: 'json' })
			}
		}
		
		const processEvent = (eventType, eventData) => {
			if (eventType === 'header') {
				if (!silent) {
					// Parse header data - format is { key: 'x-hostname', value: 'fr1dev1' }
					try {
						const headerData = JSON.parse(eventData)
						let key = headerData.key || ''
						const value = headerData.value || ''
						
						// Remove x- prefix and capitalize first letter
						key = key.replace(/^x-/i, '')
						key = key.charAt(0).toUpperCase() + key.slice(1)
						
						console.log(`🏷️  [HEADER] ${key}: ${value}`)
					} catch (e) {
						console.log('🏷️  [HEADER]', eventData)
					}
				}
			} else if (eventType === 'log') {
				logCount++
				if (!silent) {
					// Parse log data and display prettily
					try {
						const logData = JSON.parse(eventData)
						// Format: { ts: timestamp, payload: 'message', level: 'console.info' }
						const timestamp = logData.ts ? new Date(logData.ts).toISOString().slice(11, 23) : ''
						const level = logData.level || 'log'
						const payload = logData.payload
						if (!timestamp) throw new Error('Missing timestamp')
						
						// Choose icon based on log level
						let icon = '📝'
						let levelLabel = 'LOG'
						if (level.includes('error')) {
							icon = '❌'
							levelLabel = 'ERR'
						} else if (level.includes('warn')) {
							icon = '⚠️'
							levelLabel = 'WRN'
						} else if (level.includes('debug')) {
							icon = '🔍'
							levelLabel = 'DBG'
						} else if (level.includes('info')) {
							icon = 'ℹ️ '
							levelLabel = 'INF'
						}
						
						// Format and display the log
						if (timestamp) {
							console.log(`${icon} [${timestamp}] [${levelLabel}]`, payload)
						} else {
							console.log(`${icon} [${levelLabel}]`, payload)
						}
					} catch (e) {
						console.log(`📝 [LOG]`, eventData)
					}
				}
			} else if (eventType === 'message') {
				// Unnamed events (no event: line) default to 'message' - this is the final response
				resultReceived = true
				
				// Parse result data
				try {
					result = JSON.parse(eventData)
				} catch (e) {
					result = eventData
				}
				
				// Don't close the connection - let the server close it
				// More messages may arrive
			}
		}
		
		const processBuffer = () => {
			// SSE events are separated by double newlines
			// Each event can have: event: <type>, data: <data>, id: <id>, retry: <ms>
			// Multiple data: lines are concatenated with newlines
			
			let eventEnd
			while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
				const eventBlock = buffer.slice(0, eventEnd)
				buffer = buffer.slice(eventEnd + 2)
				
				// Parse the event block
				let eventType = 'message'
				const dataLines = []
				
				const lines = eventBlock.split('\n')
				for (const line of lines) {
					if (line.startsWith('event:')) {
						eventType = line.slice(6).trim()
					} else if (line.startsWith('data:')) {
						dataLines.push(line.slice(5).trim())
					}
					// Ignore id:, retry:, and comment lines (starting with :)
				}
				
				// Only process if we have data
				if (dataLines.length > 0) {
					const eventData = dataLines.join('\n')
					processEvent(eventType, eventData)
				}
			}
		}
		
		try {
			// Create a timeout promise for initial data
			let initialTimeoutReject
			const initialTimeoutPromise = new Promise((_, reject) => {
				initialTimeoutReject = reject
				setTimeout(() => {
					reject(new Error('SSE_INITIAL_TIMEOUT'))
				}, 30000)
			})
			
			while (true) {
				// If we've already resolved, break out of the loop
				if (resolved) break
				
				// Race between reading data and timeout/finished signal
				let readResult
				if (!dataReceived) {
					try {
						readResult = await Promise.race([
							reader.read(),
							initialTimeoutPromise,
							finishedPromise.then(() => ({ done: true, finished: true }))
						])
					} catch (e) {
						if (e.message === 'SSE_INITIAL_TIMEOUT') {
							if (!silent) {
								console.log('⚠️  No SSE data received within timeout')
							}
							finishWithResult()
							break
						}
						throw e
					}
				} else {
					// After initial data, race read against finished signal
					readResult = await Promise.race([
						reader.read(),
						finishedPromise.then(() => ({ done: true, finished: true }))
					])
				}
				
				// Check if we were signaled to finish
				if (readResult.finished || resolved) break
				
				const { done, value } = readResult
				
				if (done) {
					// Process any remaining complete events in buffer
					processBuffer()
					
					// Handle any remaining data in buffer that didn't end with \n\n
					// This handles non-SSE responses or final data without trailing newlines
					if (!resultReceived && buffer.trim()) {
						// Check if it looks like a partial SSE event
						const trimmedBuffer = buffer.trim()
						let finalData = trimmedBuffer
						
						// If it starts with 'data:', extract the data
						if (trimmedBuffer.startsWith('data:')) {
							finalData = trimmedBuffer.slice(5).trim()
						}
						
						// Treat remaining buffer as the result
						try {
							result = JSON.parse(finalData)
						} catch (e) {
							result = finalData
						}
						resultReceived = true
					}
					
					// Finish with whatever result we have
					finishWithResult()
					break
				}
				
				// Mark that we received data
				if (!dataReceived) {
					dataReceived = true
					// Cancel the initial timeout by resolving the promise race
					initialTimeoutReject = null
				}
				
				buffer += decoder.decode(value, { stream: true })
				processBuffer()
			}
		} catch (error) {
			if (!silent && error.name !== 'AbortError') {
				console.error('⚠️  Stream error:', error.message)
			}
			finishWithResult()
		}
	})
}

/**
 * Fetches available ScriptForge scripts from the API
 * @returns {Promise<{success: boolean, scripts?: Array, error?: string}>}
 */
async function fetchScriptForgeScripts() {
	console.log('🔍 Fetching ScriptForge scripts...')
	
	const result = await makeAuthenticatedRequest('scriptforge', 'GET', null, true)
	
	if (!result.success) {
		return result
	}
	
	const scripts = result.data
	if (!Array.isArray(scripts)) {
		return { success: false, error: 'Invalid response format - expected array' }
	}
	
	// Filter by APP_ID if available
	const appId = process.env.APP_ID
	let filteredScripts = scripts
	
	if (appId) {
		filteredScripts = scripts.filter(script => script.app_id === appId)
		console.log(`✅ Found ${filteredScripts.length} script(s) for the configured app`)
	} else {
		console.log(`✅ Found ${scripts.length} script(s)`)
	}
	
	return { success: true, scripts: filteredScripts }
}

/**
 * Prompts user for ScriptForge ID if not provided
 * @param {string} id - Optional ID from command line
 * @returns {Promise<string>}
 */
async function promptForId(id) {
	if (!id) {
		// Fetch available scripts
		const result = await fetchScriptForgeScripts()
		
		if (!result.success) {
			throw new Error(`Failed to fetch scripts: ${result.error}`)
		}
		
		if (result.scripts.length === 0) {
			const appId = process.env.APP_ID
			if (appId) {
				throw new Error('No ScriptForge scripts found for the configured app. Try running "cx configure:app" to select a different app.')
			} else {
				throw new Error('No ScriptForge scripts found. You may need to configure an app with "cx configure:app".')
			}
		}
		
		// Create choices for the select prompt
		const choices = result.scripts.map(script => ({
			name: script.name,
			value: script.id.toString(),
			description: `ID: ${script.id}`
		}))
		
		// Prompt user to select a script
		id = await select({
			message: 'Select a ScriptForge script:',
			choices,
			pageSize: 20,
			loop: false
		})
	}
	return id.trim()
}

/**
 * Prompts user for request body if not provided
 * @param {string} body - Optional body from command line
 * @returns {Promise<Object>}
 */
async function promptForBody(body) {
	if (!body) {
		const choice = await select({
			message: 'What would you like to do for the request body?',
			choices: [
				{
					name: 'No body (send empty POST request)',
					value: 'empty',
					description: 'Send an empty JSON object {}'
				},
				{
					name: 'Provide JSON data',
					value: 'json',
					description: 'Enter JSON data directly or specify a file path'
				}
			],
			default: 'empty'
		})
		
		if (choice === 'empty') {
			return {}
		}
		
		// User chose to provide JSON data
		console.log('💡 You can provide JSON data directly or a file path')
		console.log('💡 Example: {"key": "value"} or ./data.json')
		
		body = await input({
			message: 'Enter JSON request body (or file path):',
			validate: (value) => {
				if (!value || value.trim() === '') {
					return 'Please provide JSON data or a file path'
				}
				
				try {
					const { data } = detectInput(value.trim())
					validateJSON(data)
					return true
				} catch (error) {
					return error.message
				}
			}
		})
	}
	
	if (!body || body.trim() === '') {
		return {}
	}
	
	const { data } = detectInput(body.trim())
	return validateJSON(data)
}

/**
 * Main run action handler
 * @param {string} id - ScriptForge ID from command line argument
 * @param {Object} options - Command options from commander
 */
export async function runAction(id, options) {
	// Check if silent/raw mode is enabled (hoisted so catch can access)
	const silent = (options && (options.silent || options.raw)) || false
	
	// SSE options: enabled by default, but disabled in silent mode or with --no-sse
	const sseEnabled = options.sse !== false && !silent
	
	try {
		
		// Get ScriptForge ID (from argument or prompt)
		const scriptId = await promptForId(id)
		
		// Get request body based on -b flag usage
		let requestBody
		
		if (options.body === undefined) {
			// No -b flag: send empty body
			requestBody = {}
		} else if (options.body === true) {
			// -b flag with no value: prompt for JSON input directly
			if (!silent) {
				console.log('💡 You can provide JSON data directly or a file path')
				console.log('💡 Example: {"key": "value"} or ./data.json')
			}
			
			const bodyInput = await input({
				message: 'Enter JSON request body (or file path):',
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Please provide JSON data or a file path'
					}
					
					try {
						const { data } = detectInput(value.trim())
						validateJSON(data)
						return true
					} catch (error) {
						return error.message
					}
				}
			})
			
			const { data } = detectInput(bodyInput.trim())
			requestBody = validateJSON(data)
		} else {
			// -b flag with value: use provided data
			const { data } = detectInput(options.body)
			requestBody = validateJSON(data)
		}
		
		if (!silent) {
			console.log(`📋 Request Body: ${JSON.stringify(requestBody, null, 2)}`)
		}
		
		// Execute the ScriptForge with SSE options
		const fn = options.fn || null
		const sseOptions = { enabled: sseEnabled }
		const result = await executeScriptForge(scriptId, requestBody, silent, fn, sseOptions)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
			// Exit explicitly to close any lingering SSE connections
			process.exit(0)
		} else {
			handleError(result.error, silent, 'Execution failed')
			process.exit(1)
		}
	} catch (error) {
		handleError(error.message, silent)
		process.exit(1)
	}
}