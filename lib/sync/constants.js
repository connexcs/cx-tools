/**
 * Sync module constants and configuration
 */

export const SRC_DIR = './src'
export const QUERY_DIR = './query'
export const ENV_FILE = './cx.env'

// Configuration for different sync types
export const SYNC_TYPES = {
	scriptforge: {
		dir: SRC_DIR,
		endpoint: 'scriptforge',
		extension: '.js',
		contentField: 'code',
		displayName: 'ScriptForge script',
		displayNamePlural: 'ScriptForge scripts',
		icon: '📜'
	},
	query: {
		dir: QUERY_DIR,
		endpoint: 'setup/query',
		extension: '.sql',
		contentField: 'query',
		displayName: 'SQL query',
		displayNamePlural: 'SQL queries',
		icon: '🗄️'
	}
}
