import { input, select } from '@inquirer/prompts'
import {
	baseUrl,
	isValidJSON,
	detectInput,
	validateJSON,
	makeAuthenticatedRequest,
	formatOutput,
	handleError
} from './utils.js'

/**
 * Makes authenticated request to ConnexCS API
 * @param {string} id - ScriptForge ID
 * @param {Object} requestBody - JSON body for the request
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
async function executeScriptForge(id, requestBody, silent = false) {
	if (!silent) {
		console.log(`🚀 Executing ScriptForge ID: ${id}`)
		console.log(`📡 URL: ${baseUrl}scriptforge/${id}/run`)
	}
	
	return makeAuthenticatedRequest(`scriptforge/${id}/run`, 'POST', requestBody, silent)
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
		
		// Execute the ScriptForge
		const result = await executeScriptForge(scriptId, requestBody, silent)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
		} else {
			handleError(result.error, silent, 'Execution failed')
			process.exit(1)
		}
	} catch (error) {
		handleError(error.message, silent)
		process.exit(1)
	}
}