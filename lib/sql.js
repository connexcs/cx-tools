import { input } from '@inquirer/prompts'
import {
	makeAuthenticatedRequest,
	formatOutput,
	handleError
} from './utils.js'

/**
 * Makes authenticated SQL request to ConnexCS CDR API
 * @param {string} sql - SQL query to execute
 * @param {boolean} csv - Whether to return CSV format
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, format?: string}>}
 */
async function executeSQLQuery(sql, csv = false, silent = false) {
	const endpoint = csv ? 'cdr.csv' : 'cdr'
	
	if (!silent) {
		console.log(`🔍 Executing SQL query...`)
		console.log(`📡 Endpoint: ${endpoint}`)
	}
	
	const result = await makeAuthenticatedRequest(endpoint, 'POST', { sql }, silent)
	
	if (result.success) {
		// Return with format information
		return {
			success: true,
			data: result.data,
			format: result.contentType
		}
	}
	
	return result
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
 * Main SQL action handler
 * @param {string} query - SQL query from command line argument
 * @param {Object} options - Command options from commander
 */
export async function sqlAction(query, options) {
	// Check if silent/raw mode is enabled (hoisted so catch can access)
	const silent = (options && (options.silent || options.raw)) || false
	try {
		
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
			handleError(result.error, silent, 'Query failed')
			process.exit(1)
		}
	} catch (error) {
		handleError(error.message, silent)
		process.exit(1)
	}
}
