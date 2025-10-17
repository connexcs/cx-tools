import { readFileSync, existsSync } from 'fs'

export const baseUrl = 'https://app.connexcs.com/api/cp/'

/**
 * Gets credentials from environment variables
 * @returns {{username: string, password: string}}
 * @throws {Error} If credentials are not found
 */
export function getCredentials() {
	const username = process.env.CX_USERNAME
	const password = process.env.CX_PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx configure" first.')
	}
	
	return { username, password }
}

/**
 * Creates Basic Auth credentials string
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {string} Base64 encoded credentials
 */
export function createAuthHeader(username, password) {
	return Buffer.from(`${username}:${password}`).toString('base64')
}

/**
 * Checks if a string is valid JSON
 * @param {string} str - String to validate
 * @returns {boolean}
 */
export function isValidJSON(str) {
	try {
		JSON.parse(str)
		return true
	} catch (e) {
		return false
	}
}

/**
 * Detects if input is a file path or data string
 * @param {string} input - Input string to analyze
 * @returns {{isFile: boolean, data: string}}
 */
export function detectInput(input) {
	// Check if it's a file path
	if (existsSync(input)) {
		try {
			const fileContent = readFileSync(input, 'utf-8')
			return { isFile: true, data: fileContent }
		} catch (error) {
			throw new Error(`Error reading file ${input}: ${error.message}`)
		}
	}
	
	// Assume it's direct data
	return { isFile: false, data: input }
}

/**
 * Validates and parses JSON data
 * @param {string} data - JSON data to validate
 * @returns {Object} Parsed JSON object
 */
export function validateJSON(data) {
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
 * Makes an authenticated HTTP request to ConnexCS API
 * @param {string} endpoint - API endpoint (relative to baseUrl)
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object|null} body - Request body (will be JSON stringified)
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
export async function makeAuthenticatedRequest(endpoint, method = 'GET', body = null, silent = false) {
	const url = `${baseUrl}${endpoint}`
	const { username, password } = getCredentials()
	const credentials = createAuthHeader(username, password)
	
	try {
		if (!silent && method !== 'GET') {
			console.log(`🔑 ${method} ${endpoint}`)
		}
		
		const options = {
			method,
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json, text/html, text/plain, text/csv, */*'
			}
		}
		
		if (body) {
			options.body = JSON.stringify(body)
		}
		
		const response = await fetch(url, options)
		const contentType = response.headers.get('content-type') || ''
		
		if (response.ok) {
			if (!silent && method !== 'GET') {
				console.log('✅ Request successful!')
			}
			
			// Handle different content types
			if (contentType.includes('text/csv')) {
				const csvData = await response.text()
				return { success: true, data: csvData, contentType: 'csv' }
			} else if (contentType.includes('application/json') || contentType === '') {
				const text = await response.text()
				if (text && isValidJSON(text)) {
					const jsonData = JSON.parse(text)
					return { success: true, data: jsonData, contentType: 'json' }
				} else if (text) {
					return { success: true, data: text, contentType: 'text' }
				} else {
					return { success: true, data: {}, contentType: 'json' }
				}
			} else {
				const text = await response.text()
				return { success: true, data: text, contentType: 'text' }
			}
		} else {
			const responseText = await response.text()
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`
			
			// Try to extract more detailed error information
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
	} catch (error) {
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Formats output based on content type and mode
 * @param {any} data - Response data
 * @param {string} contentType - Content type (json, csv, text)
 * @param {boolean} silent - Whether to output in silent/raw mode
 */
export function formatOutput(data, contentType, silent = false) {
	if (silent) {
		// Silent mode: output only raw data
		if (contentType === 'json' && typeof data === 'object') {
			console.log(JSON.stringify(data))
		} else {
			console.log(data)
		}
	} else {
		// Normal mode: formatted output with decorations
		console.log('\n📄 Response:')
		console.log('═'.repeat(50))
		
		if (contentType === 'json' && typeof data === 'object') {
			console.log(JSON.stringify(data, null, 2))
		} else {
			console.log(data)
		}
		
		console.log('═'.repeat(50))
	}
}

/**
 * Handles errors with appropriate output based on silent mode
 * @param {string} error - Error message
 * @param {boolean} silent - Whether in silent mode
 * @param {string} prefix - Error prefix for non-silent mode
 */
export function handleError(error, silent = false, prefix = 'Error') {
	if (silent) {
		console.error(error)
	} else {
		console.error(`❌ ${prefix}:`, error)
	}
}
