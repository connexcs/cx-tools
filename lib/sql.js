import { input } from '@inquirer/prompts'

const baseUrl = 'https://app.connexcs.com/api/cp/'

/**
 * Makes authenticated SQL request to ConnexCS CDR API
 * @param {string} sql - SQL query to execute
 * @param {boolean} csv - Whether to return CSV format
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, format?: string}>}
 */
async function executeSQLQuery(sql, csv = false, silent = false) {
	const endpoint = csv ? 'cdr.csv' : 'cdr'
	const url = `${baseUrl}${endpoint}`
	
	// Get credentials from environment
	const username = process.env.USERNAME
	const password = process.env.PASSWORD
	
	if (!username || !password) {
		throw new Error('No credentials found. Please run "cx-tools configure" first.')
	}
	
	const credentials = Buffer.from(`${username}:${password}`).toString('base64')
	
	try {
		if (!silent) {
			console.log(`🔍 Executing SQL query...`)
			console.log(`📡 URL: ${url}`)
		}
		
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Basic ${credentials}`,
				'Content-Type': 'application/json',
				'Accept': csv ? 'text/csv, */*' : 'application/json, */*'
			},
			body: JSON.stringify({ sql })
		})
		
		const contentType = response.headers.get('content-type') || ''
		
		if (response.ok) {
			if (!silent) {
				console.log('✅ Query successful!')
			}
			
			if (csv || contentType.includes('text/csv')) {
				// Return CSV data as text
				const csvData = await response.text()
				return { success: true, data: csvData, format: 'csv' }
			} else {
				// Return JSON data
				const jsonData = await response.json()
				return { success: true, data: jsonData, format: 'json' }
			}
		} else {
			const responseText = await response.text()
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`
			
			// Try to get error details from response
			if (contentType.includes('application/json')) {
				try {
					const errorData = JSON.parse(responseText)
					if (errorData.error || errorData.message) {
						errorMessage = errorData.error || errorData.message
					}
				} catch (e) {
					// Use the raw text if JSON parsing fails
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
 * Prompts user for SQL query
 * @param {string} sql - Optional SQL from command line
 * @returns {Promise<string>}
 */
async function promptForSQL(sql) {
	if (!sql) {
		sql = await input({
			message: 'Enter SQL query:',
			required: true,
			validate: (value) => {
				if (!value || value.trim() === '') {
					return 'SQL query is required'
				}
				return true
			}
		})
	}
	return sql.trim()
}

/**
 * Formats output based on format type
 * @param {any} data - Response data
 * @param {string} format - Format type (json, csv)
 * @param {boolean} silent - Whether to output in silent/raw mode
 */
function formatOutput(data, format, silent = false) {
	if (silent) {
		// Silent mode: output only raw data
		if (format === 'json') {
			console.log(JSON.stringify(data))
		} else {
			console.log(data)
		}
	} else {
		// Normal mode: formatted output with decorations
		console.log('\n📄 Response:')
		console.log('═'.repeat(50))
		
		if (format === 'json') {
			console.log(JSON.stringify(data, null, 2))
		} else {
			console.log(data)
		}
		
		console.log('═'.repeat(50))
	}
}

/**
 * Main SQL action handler
 * @param {string} query - SQL query from command line argument
 * @param {Object} options - Command options from commander
 */
export async function sqlAction(query, options) {
	try {
		// Check if silent/raw mode is enabled
		const silent = options.silent || options.raw || false
		
		// Get SQL query (from argument or prompt)
		const sql = await promptForSQL(query)
		
		// Determine if CSV format is requested
		const csv = options.csv || false
		
		if (!silent) {
			console.log(`📋 SQL Query: ${sql}`)
			console.log(`📊 Format: ${csv ? 'CSV' : 'JSON'}`)
		}
		
		// Execute the SQL query
		const result = await executeSQLQuery(sql, csv, silent)
		
		if (result.success) {
			formatOutput(result.data, result.format, silent)
		} else {
			if (silent) {
				// In silent mode, write errors to stderr
				console.error(result.error)
			} else {
				console.error('❌ Query failed:', result.error)
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
