import { input } from '@inquirer/prompts'
import { existsSync, readFileSync } from 'fs'

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
 * Makes authenticated request to ConnexCS KV API
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (optional)
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function makeKVRequest(endpoint, method = 'GET', body = null, silent = false) {
	const url = `${baseUrl}${endpoint}`
	
	// Get credentials from environment
	const username = process.env.USERNAME
	const password = process.env.PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx configure" first.')
	}
	
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	
	try {
		if (!silent) {
			console.log(`🔑 KV Operation: ${method} ${endpoint}`)
		}
		
		const options = {
			method,
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json, */*'
			}
		}
		
		if (body) {
			options.body = JSON.stringify(body)
		}
		
		const response = await fetch(url, options)
		const contentType = response.headers.get('content-type') || ''
		const responseText = await response.text()
		
		if (response.ok) {
			if (!silent) {
				console.log('✅ Request successful!')
			}
			
			// Try to parse as JSON
			if (contentType.includes('application/json') || isValidJSON(responseText)) {
				try {
					const jsonData = JSON.parse(responseText)
					return { success: true, data: jsonData }
				} catch (e) {
					return { success: true, data: responseText }
				}
			} else {
				return { success: true, data: responseText }
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
					if (responseText) {
						errorMessage = responseText
					}
				}
			} else if (responseText) {
				errorMessage = responseText
			}
			
			return { success: false, error: errorMessage }
		}
	} catch (error) {
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Formats output
 * @param {any} data - Response data
 * @param {boolean} silent - Whether to output in silent/raw mode
 */
function formatOutput(data, silent = false) {
	if (silent) {
		// Silent mode: output only raw data
		if (typeof data === 'object') {
			console.log(JSON.stringify(data))
		} else {
			console.log(data)
		}
	} else {
		// Normal mode: formatted output with decorations
		console.log('\n📄 Response:')
		console.log('═'.repeat(50))
		
		if (typeof data === 'object') {
			console.log(JSON.stringify(data, null, 2))
		} else {
			console.log(data)
		}
		
		console.log('═'.repeat(50))
	}
}

/**
 * List all KV keys
 * @param {Object} options - Command options
 */
export async function kvListAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		// Execute the list request
		const result = await makeKVRequest('dev/kv', 'GET', null, silent)
		
		if (result.success) {
			formatOutput(result.data, silent)
		} else {
			if (silent) {
				console.error(result.error)
			} else {
				console.error('❌ List failed:', result.error)
			}
			process.exit(1)
		}
	} catch (error) {
		if (options.silent || options.raw) {
			console.error(error.message)
		} else {
			console.error('❌ Error:', error.message)
		}
		process.exit(1)
	}
}

/**
 * Get a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvGetAction(id, options) {
	try {
		const silent = options.silent || options.raw || false
		
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
		const result = await makeKVRequest(`dev/kv/${id}`, 'GET', null, silent)
		
		if (result.success) {
			formatOutput(result.data, silent)
		} else {
			if (silent) {
				console.error(result.error)
			} else {
				console.error('❌ Get failed:', result.error)
			}
			process.exit(1)
		}
	} catch (error) {
		if (options.silent || options.raw) {
			console.error(error.message)
		} else {
			console.error('❌ Error:', error.message)
		}
		process.exit(1)
	}
}

/**
 * Set a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvSetAction(id, options) {
	try {
		const silent = options.silent || options.raw || false
		
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
		const result = await makeKVRequest(`dev/kv/${id}`, 'PUT', bodyToSend, silent)
		
		if (result.success) {
			formatOutput(result.data, silent)
		} else {
			if (silent) {
				console.error(result.error)
			} else {
				console.error('❌ Set failed:', result.error)
			}
			process.exit(1)
		}
	} catch (error) {
		if (options.silent || options.raw) {
			console.error(error.message)
		} else {
			console.error('❌ Error:', error.message)
		}
		process.exit(1)
	}
}

/**
 * Delete a KV record by ID
 * @param {string} id - KV record ID
 * @param {Object} options - Command options
 */
export async function kvDelAction(id, options) {
	try {
		const silent = options.silent || options.raw || false
		
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
		const result = await makeKVRequest(`dev/kv/${id}`, 'DELETE', null, silent)
		
		if (result.success) {
			if (!silent) {
				console.log('✅ Key deleted successfully!')
			}
			formatOutput(result.data, silent)
		} else {
			if (silent) {
				console.error(result.error)
			} else {
				console.error('❌ Delete failed:', result.error)
			}
			process.exit(1)
		}
	} catch (error) {
		if (options.silent || options.raw) {
			console.error(error.message)
		} else {
			console.error('❌ Error:', error.message)
		}
		process.exit(1)
	}
}
