import { input, password, select } from '@inquirer/prompts'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { hostname } from 'os'
import { getRefreshToken, checkRefreshTokenExpiration, renewRefreshToken, getAccessToken } from './utils.js'

const baseUrl = 'https://app.connexcs.com/api/cp/'

/**
 * Validates credentials against the ConnexCS API
 * @param {string} username - The username to validate
 * @param {string} password - The password to validate
 * @returns {Promise<{success: boolean, companyName?: string, error?: string}>}
 */
export async function validateCredentials(username, password) {
	const authUrl = `${baseUrl}setup/account`
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')

	try {
		console.log('🔍 Validating credentials...')
		const response = await fetch(authUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		})

		// Check content type to ensure we got JSON
		const contentType = response.headers.get('content-type')

		if (response.ok) {
			if (contentType && contentType.includes('application/json')) {
				const data = await response.json()
				if (data && data.name) {
					console.log(`✅ Authentication successful! Company: ${data.name}`)
					return { success: true, companyName: data.name }
				} else {
					console.error('❌ Invalid response format - missing company name')
					return { success: false, error: 'Missing company name in response' }
				}
			} else {
				console.error('❌ Invalid response format - expected JSON')
				return { success: false, error: 'Server returned non-JSON response' }
			}
		} else {
			// Handle different HTTP error codes
			let errorMessage = `HTTP ${response.status}`

			if (response.status === 401) {
				errorMessage = 'Invalid username or password'
			} else if (response.status === 403) {
				errorMessage = 'Access forbidden - check your account permissions'
			} else if (response.status === 404) {
				errorMessage = 'API endpoint not found - check the base URL configuration'
			} else if (response.status >= 500) {
				errorMessage = 'Server error - please try again later'
			}

			console.error(`❌ Authentication failed: ${errorMessage}`)

			// Try to get additional error details if response is JSON
			try {
				if (contentType && contentType.includes('application/json')) {
					const errorData = await response.json()
					if (errorData.error || errorData.message) {
						console.error(`Details: ${errorData.error || errorData.message}`)
					}
				}
			} catch (e) {
				// Ignore JSON parsing errors for error responses
			}

			return { success: false, error: errorMessage }
		}
	} catch (error) {
		console.error('❌ Network error:', error.message)
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Requests a new refresh token using Basic Auth (initial setup)
 * @param {string} username - The username
 * @param {string} password - The password
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
export async function requestInitialRefreshToken(username, password) {
	const tokenUrl = `${baseUrl}auth/jwt/refresh`
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	const lifetimeInSeconds = 30 * 24 * 60 * 60 // 30 days = 2,592,000 seconds
	const audience = `cx-tools@${hostname()}`

	try {
		console.log('🔑 Requesting refresh token (30 days)...')
		const response = await fetch(tokenUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({ 
				lifetime: lifetimeInSeconds,
				audience: audience
			})
		})

		const contentType = response.headers.get('content-type')
		if (response.ok) {
			if (contentType && contentType.includes('application/json')) {
				const data = await response.json()
				if (data && data.token) {
					console.log('✅ Refresh token obtained successfully! (Valid for 30 days)')
					return { success: true, token: data.token }
				} else {
					console.error('❌ Invalid response format - missing token field')
					return { success: false, error: 'Missing token in response' }
				}
			} else {
				console.error('❌ Invalid response format - expected JSON')
				return { success: false, error: 'Server returned non-JSON response' }
			}
		} else {
			let errorMessage = `HTTP ${response.status}`

			if (response.status === 401) {
				errorMessage = 'Invalid username or password'
			} else if (response.status >= 500) {
				errorMessage = 'Server error - please try again later'
			}

			console.error(`❌ Failed to get refresh token: ${errorMessage}`)

			// Try to get additional error details
			try {
				if (contentType && contentType.includes('application/json')) {
					const errorData = await response.json()
					if (errorData.error || errorData.message) {
						console.error(`Details: ${errorData.error || errorData.message}`)
					}
				}
			} catch (e) {
				// Ignore JSON parsing errors
			}

			return { success: false, error: errorMessage }
		}
	} catch (error) {
		console.error('❌ Network error:', error.message)
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Prompts user for credentials if not provided
 * @param {string} username - Optional username
 * @param {string} userPassword - Optional password
 * @returns {Promise<{username: string, password: string}>}
 */
export async function promptCredentials(username, userPassword) {
	// Prompt for username if not provided via flag
	if (!username) {
		username = await input({
			message: 'Enter your username:',
			required: true
		})
	}

	// Prompt for password if not provided via flag
	if (!userPassword) {
		userPassword = await password({
			message: 'Enter your password:',
			mask: '*',
			required: true
		})
	}

	return { username, password: userPassword }
}

/**
 * Writes refresh token to .env file with company information
 * @param {string} refreshToken - The refresh token (valid for 30 days)
 * @param {string} companyName - The company name from API validation
 * @param {string} appId - Optional App ID
 */
export function writeEnvFile(refreshToken, companyName, appId = null) {
	const envPath = join(process.cwd(), '.env')
	let envContent = `# Company: ${companyName}\n# Refresh Token (Valid for 30 days)\nCX_REFRESH_TOKEN="${refreshToken}"\n`
	
	if (appId) {
		envContent += `APP_ID=${appId}\n`
	}

	try {
		writeFileSync(envPath, envContent)
		console.log('✅ Refresh token saved to .env file successfully!')
		console.log('ℹ️  Token is valid for 30 days. Run "cx configure" again to refresh.')
	} catch (error) {
		console.error('❌ Error writing .env file:', error.message)
		process.exit(1)
	}
}

/**
 * Main configure action handler
 * @param {Object} options - Command options from commander
 */
export async function configureAction(options) {
	const envPath = join(process.cwd(), '.env')

	// Check if .env file exists and force flag is not set
	if (existsSync(envPath) && !options.force) {
		console.log('⚠️  .env file already exists. Use --force to overwrite.')
		return
	}

	// Get credentials (either from options or prompts)
	const { username, password: userPassword } = await promptCredentials(options.username, options.password)

	// Validate credentials before requesting token
	const validation = await validateCredentials(username, userPassword)

	if (!validation.success) {
		console.error('❌ Credential validation failed:', validation.error)
		console.error('Please check your username and password and try again.')
		process.exit(1)
	}

	// Get refresh token
	const tokenResult = await requestInitialRefreshToken(username, userPassword)

	if (!tokenResult.success) {
		console.error('❌ Failed to obtain refresh token:', tokenResult.error)
		process.exit(1)
	}

	// Write refresh token to .env file
	writeEnvFile(tokenResult.token, validation.companyName)
}

/**
 * Fetches available apps from the ConnexCS API using JWT
 * @returns {Promise<{success: boolean, apps?: Array, error?: string}>}
 */
export async function fetchApps() {
	const appUrl = `${baseUrl}setup/app`

	try {
		console.log('🔍 Fetching available apps...')
		
		// Get refresh token from environment
		let refreshToken
		try {
			refreshToken = getRefreshToken()
		} catch (error) {
			return { success: false, error: 'No refresh token found. Please run "cx configure" first.' }
		}

		// Check if token needs renewal (less than 15 days remaining)
		const { needsRenewal } = checkRefreshTokenExpiration(refreshToken)
		if (needsRenewal) {
			try {
				refreshToken = await renewRefreshToken(refreshToken, false)
			} catch (error) {
				// Continue with old token if renewal fails
				console.warn('⚠️  Continuing with existing token...')
			}
		}

		// Get access token
		const accessToken = await getAccessToken(refreshToken)

		// Fetch apps using access token
		const response = await fetch(appUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			}
		})

		const contentType = response.headers.get('content-type')

		if (response.ok) {
			if (contentType && contentType.includes('application/json')) {
				const apps = await response.json()
				if (Array.isArray(apps) && apps.length > 0) {
					console.log(`✅ Found ${apps.length} app(s)`)
					return { success: true, apps }
				} else if (Array.isArray(apps) && apps.length === 0) {
					console.log('⚠️  No apps found for this account')
					return { success: false, error: 'No apps available' }
				} else {
					console.error('❌ Invalid response format - expected array of apps')
					return { success: false, error: 'Invalid response format' }
				}
			} else {
				console.error('❌ Invalid response format - expected JSON')
				return { success: false, error: 'Server returned non-JSON response' }
			}
		} else {
			let errorMessage = `HTTP ${response.status}`
			if (response.status === 401) {
				errorMessage = 'Authentication failed - please run "cx configure" first'
			} else if (response.status >= 500) {
				errorMessage = 'Server error - please try again later'
			}
			console.error(`❌ Failed to fetch apps: ${errorMessage}`)
			return { success: false, error: errorMessage }
		}
	} catch (error) {
		console.error('❌ Network error:', error.message)
		return { success: false, error: `Network error: ${error.message}` }
	}
}

/**
 * Updates the .env file with the selected app ID
 * @param {string} appId - The app ID to save
 */
export function updateEnvWithApp(appId) {
	const envPath = join(process.cwd(), '.env')
	
	if (!existsSync(envPath)) {
		console.error('❌ .env file not found. Please run "cx configure" first.')
		process.exit(1)
	}

	try {
		// Read existing .env content
		let envContent = readFileSync(envPath, 'utf-8')
		
		// Check if APP_ID already exists
		if (envContent.includes('APP_ID=')) {
			// Replace existing APP_ID
			envContent = envContent.replace(/APP_ID=.*/g, `APP_ID=${appId}`)
		} else {
			// Add APP_ID to the end
			if (!envContent.endsWith('\n')) {
				envContent += '\n'
			}
			envContent += `APP_ID=${appId}\n`
		}
		
		writeFileSync(envPath, envContent)
		console.log('✅ App ID saved to .env file successfully!')
	} catch (error) {
		console.error('❌ Error updating .env file:', error.message)
		process.exit(1)
	}
}

/**
 * App configuration action handler
 * @param {Object} options - Command options from commander
 */
export async function configureAppAction(options) {
	const envPath = join(process.cwd(), '.env')
	
	// Check if .env file exists
	if (!existsSync(envPath)) {
		console.error('❌ .env file not found. Please run "cx configure" first to set up your refresh token.')
		process.exit(1)
	}

	// Check if refresh token exists
	const refreshToken = process.env.CX_REFRESH_TOKEN
	
	if (!refreshToken) {
		console.error('❌ Refresh token not found in .env file. Please run "cx configure" first.')
		process.exit(1)
	}

	// Fetch available apps
	const result = await fetchApps()
	
	if (!result.success) {
		console.error('❌ Failed to fetch apps:', result.error)
		process.exit(1)
	}

	// Create choices for the select prompt (sorted alphabetically)
	const choices = result.apps
		.map(app => ({
			name: app.name,
			value: app.id,
			description: app.id
		}))
		.sort((a, b) => a.name.localeCompare(b.name))

	// Prompt user to select an app
	const selectedAppId = await select({
		message: 'Select an app:',
		choices
	})

	// Update .env file with selected app ID
	updateEnvWithApp(selectedAppId)
	
	// Show the selected app name
	const selectedApp = result.apps.find(app => app.id === selectedAppId)
	if (selectedApp) {
		console.log(`✅ Selected app: ${selectedApp.name}`)
	}
}
