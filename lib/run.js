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
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function executeScriptForge(id, requestBody) {
	const url = `${baseUrl}scriptforge/${id}/run`
	
	// Get credentials from environment
	const username = process.env.USERNAME
	const password = process.env.PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx-tools configure" first.')
	}
	
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	
	try {
		console.log(`🚀 Executing ScriptForge ID: ${id}`)
		console.log(`📡 URL: ${url}`)
		
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
			console.log('✅ Request successful!')
			
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
 * Prompts user for ScriptForge ID if not provided
 * @param {string} id - Optional ID from command line
 * @returns {Promise<string>}
 */
async function promptForId(id) {
	if (!id) {
		id = await input({
			message: 'Enter ScriptForge ID:',
			required: true,
			validate: (value) => {
				if (!value || value.trim() === '') {
					return 'ScriptForge ID is required'
				}
				return true
			}
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
 */
function formatOutput(data, contentType) {
	console.log('\n📄 Response:')
	console.log('═'.repeat(50))
	
	if (contentType === 'json') {
		console.log(JSON.stringify(data, null, 2))
	} else {
		console.log(data)
	}
	
	console.log('═'.repeat(50))
}

/**
 * Main run action handler
 * @param {string} id - ScriptForge ID from command line argument
 * @param {Object} options - Command options from commander
 */
export async function runAction(id, options) {
	try {
		// Get ScriptForge ID (from argument or prompt)
		const scriptId = await promptForId(id)
		
		// Get request body (from option, argument, or prompt)
		let requestBody
		if (options.body) {
			const { data } = detectInput(options.body)
			requestBody = validateJSON(data)
		} else {
			requestBody = await promptForBody()
		}
		
		console.log(`📋 Request Body: ${JSON.stringify(requestBody, null, 2)}`)
		
		// Execute the ScriptForge
		const result = await executeScriptForge(scriptId, requestBody)
		
		if (result.success) {
			formatOutput(result.data, result.contentType)
		} else {
			console.error('❌ Execution failed:', result.error)
			process.exit(1)
		}
	} catch (error) {
		console.error('❌ Error:', error.message)
		process.exit(1)
	}
}