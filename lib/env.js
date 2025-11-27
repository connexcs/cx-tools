import { input } from '@inquirer/prompts'
import { existsSync } from 'fs'
import {
	detectInput,
	makeAuthenticatedRequest,
	handleError
} from './utils.js'

/**
 * Get the configured APP_ID from environment
 * @returns {string|null} The APP_ID or null if not configured
 */
function getAppId() {
	return process.env.APP_ID || null
}

/**
 * Build the setup/var endpoint with optional app_id query parameter
 * @param {string} [suffix] - Optional suffix to append (e.g., '/{id}')
 * @returns {string} The endpoint path with query string if APP_ID is configured
 */
function buildEnvEndpoint(suffix = '') {
	const appId = getAppId()
	const base = `setup/var${suffix}`
	return appId ? `${base}?app_id=${appId}` : base
}

/**
 * Format environment variable for display
 * @param {Object} envVar - Environment variable object with key and value
 * @param {boolean} silent - Whether to use silent mode
 */
function formatEnvVar(envVar, silent) {
	if (silent) {
		// In silent mode, output only key and value as JSON
		console.log(JSON.stringify({ key: envVar.key, value: envVar.value }))
	} else {
		console.log(`${envVar.key}: ${envVar.value}`)
	}
}

/**
 * Format environment variables list for display
 * @param {Array} envVars - Array of environment variable objects
 * @param {boolean} silent - Whether to use silent mode
 */
function formatEnvList(envVars, silent) {
	if (silent) {
		// In silent mode, output only key and value fields as JSON array
		const simplified = envVars.map(v => ({ key: v.key, value: v.value }))
		console.log(JSON.stringify(simplified))
	} else {
		if (envVars.length === 0) {
			console.log('No environment variables found.')
		} else {
			envVars.forEach(v => {
				console.log(`${v.key}: ${v.value}`)
			})
		}
	}
}

/**
 * List all environment variables
 * @param {Object} options - Command options
 */
export async function envListAction(options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		const appId = getAppId()
		if (!appId && !silent) {
			console.log('⚠️  No APP_ID configured. Showing all variables. Use "cx configure:app" to filter by app.')
		}
		
		// Execute the list request with app_id filter
		const result = await makeAuthenticatedRequest(buildEnvEndpoint(), 'GET', null, silent)
		
		if (result.success) {
			const data = Array.isArray(result.data) ? result.data : []
			formatEnvList(data, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Get an environment variable by key
 * @param {string} key - Environment variable key
 * @param {Object} options - Command options
 */
export async function envGetAction(key, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for key if not provided
		if (!key) {
			key = await input({
				message: 'Enter variable key:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Variable key is required'
					}
					return true
				}
			})
			key = key.trim()
		}
		
		if (!silent) {
			console.log(`📋 Variable key: ${key}`)
		}
		
		// First, get all variables (filtered by app_id) and find the one with matching key
		const result = await makeAuthenticatedRequest(buildEnvEndpoint(), 'GET', null, silent)
		
		if (result.success) {
			const data = Array.isArray(result.data) ? result.data : []
			const envVar = data.find(v => v.key === key)
			
			if (envVar) {
				formatEnvVar(envVar, silent)
			} else {
				handleError(`Variable with key '${key}' not found`, silent)
			}
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Set an environment variable by key
 * @param {string} key - Environment variable key
 * @param {Object} options - Command options
 */
export async function envSetAction(key, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for key if not provided
		if (!key) {
			key = await input({
				message: 'Enter variable key:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Variable key is required'
					}
					return true
				}
			})
			key = key.trim()
		}
		
		// Get value to set
		let value
		if (options.value === undefined) {
			// No -v flag: prompt for value
			if (!silent) {
				console.log('💡 Enter the value for this environment variable')
			}
			
			value = await input({
				message: 'Enter value:',
				required: true,
				validate: (val) => {
					if (val === undefined || val === null) {
						return 'Value is required'
					}
					return true
				}
			})
		} else if (options.value === true) {
			// -v flag with no value: prompt for input directly
			if (!silent) {
				console.log('💡 Enter the value for this environment variable')
			}
			
			value = await input({
				message: 'Enter value:',
				required: true,
				validate: (val) => {
					if (val === undefined || val === null) {
						return 'Value is required'
					}
					return true
				}
			})
		} else {
			// -v flag with value: use provided data
			// Try to read as file first
			if (existsSync(options.value)) {
				const { data } = detectInput(options.value)
				value = data
			} else {
				value = options.value
			}
		}
		
		if (!silent) {
			console.log(`📋 Key: ${key}`)
			console.log(`📋 Value: ${value}`)
		}
		
		// Get app_id for the request
		const appId = getAppId()
		if (!appId) {
			handleError('No APP_ID configured. Use "cx configure:app" first.', silent)
			return
		}
		
		// First, check if the variable already exists to get its ID (filtered by app_id)
		const listResult = await makeAuthenticatedRequest(buildEnvEndpoint(), 'GET', null, silent)
		
		if (!listResult.success) {
			handleError(listResult.error, silent)
			return
		}
		
		const existingVars = Array.isArray(listResult.data) ? listResult.data : []
		const existingVar = existingVars.find(v => v.key === key)
		
		// Build the body with key, value, and app_id fields
		const bodyToSend = { key, value, app_id: appId }
		
		let result
		if (existingVar) {
			// Update existing variable using its ID
			result = await makeAuthenticatedRequest(`setup/var/${existingVar.id}`, 'PUT', bodyToSend, silent)
		} else {
			// Create new variable
			result = await makeAuthenticatedRequest('setup/var', 'POST', bodyToSend, silent)
		}
		
		if (result.success) {
			if (!silent) {
				console.log('✅ Variable saved successfully!')
			}
			// Output the saved key:value
			formatEnvVar({ key, value }, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Delete an environment variable by key
 * @param {string} key - Environment variable key
 * @param {Object} options - Command options
 */
export async function envDelAction(key, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for key if not provided
		if (!key) {
			key = await input({
				message: 'Enter variable key to delete:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Variable key is required'
					}
					return true
				}
			})
			key = key.trim()
		}
		
		if (!silent) {
			console.log(`📋 Variable key: ${key}`)
			console.log(`🗑️  Deleting variable...`)
		}
		
		// First, get all variables (filtered by app_id) to find the ID for this key
		const listResult = await makeAuthenticatedRequest(buildEnvEndpoint(), 'GET', null, silent)
		
		if (!listResult.success) {
			handleError(listResult.error, silent)
			return
		}
		
		const existingVars = Array.isArray(listResult.data) ? listResult.data : []
		const existingVar = existingVars.find(v => v.key === key)
		
		if (!existingVar) {
			handleError(`Variable with key '${key}' not found`, silent)
			return
		}
		
		// Execute the delete request using the ID
		const result = await makeAuthenticatedRequest(`setup/var/${existingVar.id}`, 'DELETE', null, silent)
		
		if (result.success) {
			if (!silent) {
				console.log('✅ Variable deleted successfully!')
			}
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}
