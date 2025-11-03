import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

export const baseUrl = 'https://app.connexcs.com/api/cp/'

/**
 * Decodes a JWT token to get payload (without verification)
 * @param {string} token - JWT token
 * @returns {Object} Decoded payload
 */
function decodeJWT(token) {
	try {
		const parts = token.split('.')
		if (parts.length !== 3) {
			throw new Error('Invalid JWT format')
		}
		const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
		return payload
	} catch (error) {
		throw new Error(`Failed to decode JWT: ${error.message}`)
	}
}

/**
 * Gets refresh token from environment variables
 * @returns {string} Refresh token
 * @throws {Error} If refresh token is not found
 */
export function getRefreshToken() {
	const refreshToken = process.env.CX_REFRESH_TOKEN
	
	if (!refreshToken) {
		throw new Error('No refresh token found. Please run "cx configure" first.')
	}
	
	return refreshToken
}

/**
 * Checks if refresh token needs renewal (less than 15 days remaining)
 * @param {string} refreshToken - The refresh token
 * @returns {{needsRenewal: boolean, daysRemaining: number}} Renewal status
 */
export function checkRefreshTokenExpiration(refreshToken) {
	try {
		const payload = decodeJWT(refreshToken)
		if (!payload.exp) {
			return { needsRenewal: false, daysRemaining: null }
		}
		
		const now = Math.floor(Date.now() / 1000)
		const secondsRemaining = payload.exp - now
		const daysRemaining = Math.floor(secondsRemaining / (24 * 60 * 60))
		
		return {
			needsRenewal: daysRemaining < 15,
			daysRemaining: Math.max(0, daysRemaining)
		}
	} catch (error) {
		// If we can't decode, assume it needs renewal
		return { needsRenewal: true, daysRemaining: 0 }
	}
}

/**
 * Renews the refresh token automatically
 * @param {string} oldRefreshToken - The current refresh token
 * @param {boolean} silent - Whether to suppress output
 * @returns {Promise<string>} New refresh token
 */
export async function renewRefreshToken(oldRefreshToken, silent = false) {
	const url = `${baseUrl}auth/jwt/refresh`
	const lifetimeInSeconds = 30 * 24 * 60 * 60 // 30 days
	
	try {
		if (!silent) {
			console.log('🔄 Refresh token has less than 15 days remaining. Renewing automatically...')
		}
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${oldRefreshToken}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({ lifetime: lifetimeInSeconds })
		})

		if (response.ok) {
			const data = await response.json()
			if (data && data.token) {
				// Update .env file with new token
				const envPath = join(process.cwd(), '.env')
				if (existsSync(envPath)) {
					let envContent = readFileSync(envPath, 'utf-8')
					envContent = envContent.replace(
						/CX_REFRESH_TOKEN="[^"]*"/,
						`CX_REFRESH_TOKEN="${data.token}"`
					)
					writeFileSync(envPath, envContent)
					
					// Update process.env for current session
					process.env.CX_REFRESH_TOKEN = data.token
					
					if (!silent) {
						console.log('✅ Refresh token renewed successfully! (Valid for 30 more days)')
					}
				}
				
				return data.token
			} else {
				throw new Error('Invalid token response - missing token field')
			}
		} else {
			if (response.status === 401) {
				throw new Error('Refresh token expired or invalid. Please run "cx configure" to get a new token.')
			}
			throw new Error(`Failed to renew refresh token: HTTP ${response.status}`)
		}
	} catch (error) {
		if (!silent) {
			console.error('⚠️  Failed to auto-renew refresh token:', error.message)
			console.error('ℹ️  Please run "cx configure" to manually refresh your token.')
		}
		throw error
	}
}

/**
 * Gets a short-lived access token using the refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<string>} Short-lived access token
 * @throws {Error} If token request fails
 */
export async function getAccessToken(refreshToken) {
	const url = `${baseUrl}auth/jwt`
	
	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${refreshToken}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		})

		if (response.ok) {
			const data = await response.json()
			if (data && data.token) {
				return data.token
			} else {
				throw new Error('Invalid token response - missing token field')
			}
		} else {
			if (response.status === 401) {
				throw new Error('Refresh token expired or invalid. Please run "cx configure" to get a new token.')
			}
			throw new Error(`Failed to get access token: HTTP ${response.status}`)
		}
	} catch (error) {
		if (error.message.includes('Refresh token expired')) {
			throw error
		}
		throw new Error(`Token request failed: ${error.message}`)
	}
}

/**
 * Creates Basic Auth credentials string (for initial authentication)
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {string} Base64 encoded credentials
 */
export function createBasicAuthHeader(username, password) {
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
 * Makes an authenticated HTTP request to ConnexCS API using JWT
 * @param {string} endpoint - API endpoint (relative to baseUrl)
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object|null} body - Request body (will be JSON stringified)
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, contentType?: string}>}
 */
export async function makeAuthenticatedRequest(endpoint, method = 'GET', body = null, silent = false) {
	const url = `${baseUrl}${endpoint}`
	
	try {
		// Get refresh token
		let refreshToken = getRefreshToken()
		
		// Check if token needs renewal (less than 15 days remaining)
		const { needsRenewal, daysRemaining } = checkRefreshTokenExpiration(refreshToken)
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
		
		if (!silent && method !== 'GET') {
			console.log(`🔑 ${method} ${endpoint}`)
		}
		
		const options = {
			method,
			headers: {
				'Authorization': `Bearer ${accessToken}`,
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
