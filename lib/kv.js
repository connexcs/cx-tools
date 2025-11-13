import { input } from '@inquirer/prompts'
import { existsSync } from 'fs'
import {
	isValidJSON,
	detectInput,
	makeAuthenticatedRequest,
	formatOutput,
	handleError
} from './utils.js'

/**
 * Lists all keys in the KV store
 */

/**
 * List all KV keys
 * @param {Object} options - Command options
 */
export async function kvListAction(options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Execute the list request
		const result = await makeAuthenticatedRequest('dev/kv', 'GET', null, silent)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Get a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvGetAction(id, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for ID if not provided
		if (!id) {
			id = await input({
				message: 'Enter key ID:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Key ID is required'
					}
					return true
				}
			})
			id = id.trim()
		}
		
		if (!silent) {
			console.log(`📋 Key ID: ${id}`)
		}
		
		// Execute the get request
		const result = await makeAuthenticatedRequest(`dev/kv/${id}`, 'GET', null, silent)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Set a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvSetAction(id, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for ID if not provided
		if (!id) {
			id = await input({
				message: 'Enter key ID:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Key ID is required'
					}
					return true
				}
			})
			id = id.trim()
		}
		
		// Get value/data to set
		let value
		if (options.value === undefined) {
			// No -v flag: prompt for value
			if (!silent) {
				console.log('💡 You can provide any string, JSON data, or a file path')
				console.log('💡 Examples: "hello world", {"key": "value"}, or ./data.json')
			}
			
			const valueInput = await input({
				message: 'Enter value (string, JSON, or file path):',
				required: true,
				validate: (val) => {
					if (val === undefined || val === null) {
						return 'Value is required'
					}
					return true
				}
			})
			
			// Try to read as file first, otherwise use as-is
			if (existsSync(valueInput.trim())) {
				const { data } = detectInput(valueInput.trim())
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(data)) {
					value = JSON.parse(data)
				} else {
					value = data
				}
			} else {
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(valueInput)) {
					value = JSON.parse(valueInput)
				} else {
					value = valueInput
				}
			}
		} else if (options.value === true) {
			// -v flag with no value: prompt for input directly
			if (!silent) {
				console.log('💡 You can provide any string, JSON data, or a file path')
				console.log('💡 Examples: "hello world", {"key": "value"}, or ./data.json')
			}
			
			const valueInput = await input({
				message: 'Enter value (string, JSON, or file path):',
				required: true,
				validate: (val) => {
					if (val === undefined || val === null) {
						return 'Value is required'
					}
					return true
				}
			})
			
			// Try to read as file first, otherwise use as-is
			if (existsSync(valueInput.trim())) {
				const { data } = detectInput(valueInput.trim())
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(data)) {
					value = JSON.parse(data)
				} else {
					value = data
				}
			} else {
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(valueInput)) {
					value = JSON.parse(valueInput)
				} else {
					value = valueInput
				}
			}
		} else {
			// -v flag with value: use provided data
			// Try to read as file first
			if (existsSync(options.value)) {
				const { data } = detectInput(options.value)
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(data)) {
					value = JSON.parse(data)
				} else {
					value = data
				}
			} else {
				// Try to parse as JSON if it looks like JSON
				if (isValidJSON(options.value)) {
					value = JSON.parse(options.value)
				} else {
					value = options.value
				}
			}
		}
		
		if (!silent) {
			console.log(`📋 Key ID: ${id}`)
			if (typeof value === 'object') {
				console.log(`📋 Value: ${JSON.stringify(value, null, 2)}`)
			} else {
				console.log(`📋 Value: ${value}`)
			}
		}
		
		// Execute the set request (PUT for upsert)
		// If the value is not an object, wrap it in an object for the API
		const bodyToSend = typeof value === 'object' && value !== null ? value : { value }
		const result = await makeAuthenticatedRequest(`dev/kv/${id}`, 'PUT', bodyToSend, silent)
		
		if (result.success) {
			formatOutput(result.data, result.contentType, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}

/**
 * Delete a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvDelAction(id, options) {
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
		// Prompt for ID if not provided
		if (!id) {
			id = await input({
				message: 'Enter key ID to delete:',
				required: true,
				validate: (value) => {
					if (!value || value.trim() === '') {
						return 'Key ID is required'
					}
					return true
				}
			})
			id = id.trim()
		}
		
		if (!silent) {
			console.log(`📋 Key ID: ${id}`)
			console.log(`🗑️  Deleting key...`)
		}
		
		// Execute the delete request
		const result = await makeAuthenticatedRequest(`dev/kv/${id}`, 'DELETE', null, silent)
		
		if (result.success) {
			if (!silent) {
				console.log('✅ Key deleted successfully!')
			}
			formatOutput(result.data, result.contentType, silent)
		} else {
			handleError(result.error, silent)
		}
	} catch (error) {
		handleError(error.message, silent)
	}
}
