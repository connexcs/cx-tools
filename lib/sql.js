import { input } from '@inquirer/prompts'
import {
	makeAuthenticatedRequest,
	formatOutput,
	handleError,
	detectInput,
	validateJSON
} from './utils.js'

/**
 * Makes authenticated SQL request to ConnexCS API
 * @param {string} sql - SQL query to execute
 * @param {Object} params - Query parameters for prepared statements
 * @param {string} src - Database source: 'cdr' or 'userspace'
 * @param {boolean} csv - Whether to return CSV format
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<{success: boolean, data?: any, error?: string, format?: string}>}
 */
async function executeSQLQuery(sql, params = {}, src = 'cdr', csv = false, silent = false) {
	const endpoint = 'setup/query/0/run'
	
	if (!silent) {
		console.log(`🔍 Executing SQL query...`)
		console.log(`📡 Database: ${src}`)
		console.log(`📊 Format: ${csv ? 'CSV' : 'JSON'}`)
	}
	
	// Build request body with new format
	const body = {
		_query: sql,
		_src: src,
		...params // Merge prepared statement parameters
	}
	
	// Add CSV format flag if requested
	if (csv) {
		body._format = 'csv'
	}
	
	const result = await makeAuthenticatedRequest(endpoint, 'POST', body, silent)
	
	if (result.success) {
		// Return with format information
		return {
			success: true,
			data: result.data,
			format: csv ? 'csv' : result.contentType
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
		
		// Determine database source
		const src = options.userspace ? 'userspace' : 'cdr'
		
		// Determine if CSV format is requested
		const csv = options.csv || false
		
		// Parse parameters from JSON file or object if provided
		let params = {}
		if (options.params) {
			try {
				const { data } = detectInput(options.params)
				params = validateJSON(data)
			} catch (error) {
				handleError(`Invalid params JSON: ${error.message}`, silent)
				process.exit(1)
			}
		}
		
		if (!silent) {
			console.log(`📋 SQL Query: ${sql}`)
			console.log(`💾 Database: ${src}`)
			console.log(`📊 Format: ${csv ? 'CSV' : 'JSON'}`)
			if (Object.keys(params).length > 0) {
				console.log(`🔧 Parameters:`, params)
			}
		}
		
		// Execute the SQL query
		const result = await executeSQLQuery(sql, params, src, csv, silent)
		
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
