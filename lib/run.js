import { input, select } from '@inquirer/prompts'
import { readFileSync } from 'fs'
import { existsSync } from 'fs'

const baseUrl = 'https://app.connexcs.com/api/cp/'

/**
 * Checks if a string is valid JSON
 * @param {string} str - String to validate
 * @returns {boolean}
 */
function isValidJSON(str) {
	try {
		JSON.parse(str)
		return true
	} catch (e) {
		return false
	}
}

/**
 * Detects if input is a file path or JSON data
 * @param {string} input - Input string to analyze
 * @returns {{isFile: boolean, data: string}}
 */
function detectInput(input) {
	// Check if it's a file path
	if (existsSync(input)) {
		try {
			const fileContent = readFileSync(input, 'utf-8')
			return { isFile: true, data: fileContent }
		} catch (error) {
			throw new Error(`Error reading file ${input}: ${error.message}`)
		}
	}
	
	// Assume it's JSON data
	return { isFile: false, data: input }
}

/**
 * Validates and parses JSON data
 * @param {string} data - JSON data to validate
 * @returns {Object} Parsed JSON object
 */
function validateJSON(data) {
	if (!data || data.trim() === '') {
		return {}
	}
	
	try {
		return JSON.parse(data)
	} catch (error) {
		throw new Error(`Invalid JSON data: ${error.message}`)
	}
}

/**
 * Makes authenticated request to ConnexCS API
 * @param {string} id - ScriptForge ID
 * @param {Object} requestBody - JSON body for the request
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function executeScriptForge(id, requestBody, silent = false) {
	const url = `${baseUrl}scriptforge/${id}/run`
	
	// Get credentials from environment
	const username = process.env.USERNAME
	const password = process.env.PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx-tools configure" first.')
	}
	
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	
	try {
		if (!silent) {
			console.log(`🚀 Executing ScriptForge ID: ${id}`)
			console.log(`📡 URL: ${url}`)
		}
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/html, text/plain, */*'
			},
			body: JSON.stringify(requestBody)
		})
		
		const contentType = response.headers.get('content-type') || ''
		const responseText = await response.text()
		
		if (response.ok) {
			if (!silent) {
				console.log('✅ Request successful!')
			}
			
			// Try to parse as JSON first
			if (contentType.includes('application/json') || isValidJSON(responseText)) {
				try {
					const jsonData = JSON.parse(responseText)
					return { success: true, data: jsonData, contentType: 'json' }
				} catch (e) {
					// If parsing fails, treat as text
					return { success: true, data: responseText, contentType: 'text' }
				}
			} else {
				// Return as text/HTML
				return { success: true, data: responseText, contentType: 'text' }
			}
		} else {
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`
			
			// Try to get error details from response
			if (contentType.includes('application/json') && isValidJSON(responseText)) {
				try {
					const errorData = JSON.parse(responseText)
					if (errorData.error || errorData.message) {
						errorMessage = errorData.error || errorData.message
					}
				} catch (e) {
					// Ignore parsing errors
				}
			}
			
			return { success: false, error: errorMessage }
		}
	} catch (error) {
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Fetches available ScriptForge scripts from the API
 * @returns {Promise<{success: boolean, scripts?: Array, error?: string}>}
 */
async function fetchScriptForgeScripts() {
	const url = `${baseUrl}scriptforge`
	
	// Get credentials from environment
	const username = process.env.USERNAME
	const password = process.env.PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx configure" first.')
	}
	
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	
	try {
		console.log('🔍 Fetching ScriptForge scripts...')
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		})
		
		const contentType = response.headers.get('content-type') || ''
		
		if (response.ok) {
			if (contentType && contentType.includes('application/json')) {
				const scripts = await response.json()
				if (Array.isArray(scripts)) {
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
				} else {
					return { success: false, error: 'Invalid response format - expected array' }
				}
			} else {
				return { success: false, error: 'Server returned non-JSON response' }
			}
		} else {
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`
			if (response.status === 401) {
				errorMessage = 'Authentication failed - please run "cx configure" first'
			}
			return { success: false, error: errorMessage }
		}
	} catch (error) {
		return { success: false, error: `Network error: ${error.message}` }
	}
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
 * Formats output based on content type
 * @param {any} data - Response data
 * @param {string} contentType - Content type (json, text, html)
 * @param {boolean} silent - Whether to output in silent/raw mode
 */
function formatOutput(data, contentType, silent = false) {
	if (silent) {
		// Silent mode: output only raw data
		if (contentType === 'json') {
			console.log(JSON.stringify(data))
		} else {
			console.log(data)
		}
	} else {
		// Normal mode: formatted output with decorations
		console.log('\n📄 Response:')
		console.log('═'.repeat(50))
		
		if (contentType === 'json') {
			console.log(JSON.stringify(data, null, 2))
		} else {
			console.log(data)
		}
		
		console.log('═'.repeat(50))
	}
}

/**
 * Main run action handler
 * @param {string} id - ScriptForge ID from command line argument
 * @param {Object} options - Command options from commander
 */
export async function runAction(id, options) {
	try {
		// Check if silent/raw mode is enabled
		const silent = options.silent || options.raw || false
		
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
		
		// Execute the ScriptForge
		const result = await executeScriptForge(scriptId, requestBody, silent)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
		} else {
			if (silent) {
				// In silent mode, write errors to stderr
				console.error(result.error)
			} else {
				console.error('❌ Execution failed:', result.error)
			}
			process.exit(1)
		}
	} catch (error) {
		if (options.silent || options.raw) {
			// In silent mode, write errors to stderr
			console.error(error.message)
		} else {
			console.error('❌ Error:', error.message)
		}
		process.exit(1)
	}
}