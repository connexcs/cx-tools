#!/usr/bin/env node

import { program } from 'commander'
import { configureAction, configureAppAction } from './lib/configure.js'
import { runAction } from './lib/run.js'
import { sqlAction } from './lib/sql.js'
import { kvListAction, kvGetAction, kvSetAction, kvDelAction } from './lib/kv.js'
import { envListAction, envGetAction, envSetAction, envDelAction } from './lib/env.js'
import { pullAction, clearAction, pushAction } from './lib/sync.js'
import { configDotenv } from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'))
	
configDotenv({quiet: true})

program
	.name('connexcs-tools')
	.description('ConnexCS.com Tools')
	.version(packageJson.version)

// Command to configure credentials
program
	.command('configure')
	.description('Configure authentication and obtain refresh token (valid for 30 days)')
	.option('-u, --username <username>', 'Username for authentication')
	.option('-p, --password <password>', 'Password for authentication')
	.option('-f, --force', 'Force overwrite existing .env file')
	.action(configureAction)

// Command to configure app
program
	.command('configure:app')
	.description('Configure the App ID for API requests')
	.action(configureAppAction)

// Command to run ScriptForge scripts
program
	.command('run [id]')
	.description('Execute a ScriptForge script by ID')
	.option('-f, --fn <function>', 'Function name to execute within the script')
	.option('-b, --body [body]', 'Include JSON request body (optionally provide JSON string or file path)')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.option('--no-sse', 'Disable SSE log streaming (logs are streamed by default)')
	.option('--log-delay <ms>', 'Delay in ms to wait for late logs after result received (default: 2000)', '2000')
	.action(runAction)

// Command to execute SQL queries on CDR database
program
	.command('sql [query]')
	.description('Execute SQL query on CDR database')
	.option('--csv', 'Return results in CSV format instead of JSON')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(sqlAction)

// KV (Key-Value) store commands
program
	.command('kv:list')
	.description('List all KV keys')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(kvListAction)

program
	.command('kv:get [id]')
	.description('Get a KV record by ID')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(kvGetAction)

program
	.command('kv:set [id]')
	.description('Set a KV record by ID (upsert)')
	.option('-v, --value [value]', 'Value to set (JSON data or file path)')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(kvSetAction)

program
	.command('kv:del [id]')
	.description('Delete a KV record by ID')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(kvDelAction)

// ENV (Environment Variables) commands
program
	.command('env:list')
	.description('List all environment variables')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(envListAction)

program
	.command('env:get [key]')
	.description('Get an environment variable by key')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(envGetAction)

program
	.command('env:set [key]')
	.description('Set an environment variable by key (upsert)')
	.option('-v, --value [value]', 'Value to set (string or file path)')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(envSetAction)

program
	.command('env:del [key]')
	.description('Delete an environment variable by key')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
	.action(envDelAction)

// Command to pull ScriptForge scripts to local ./src folder
program
	.command('pull')
	.description('Pull ScriptForge scripts to ./src folder (filtered by APP_ID)')
	.option('-s, --silent', 'Silent/raw mode - suppress decorative output')
	.option('-r, --raw', 'Alias for --silent')
	.action(pullAction)

// Command to clear the ./src folder
program
	.command('clear')
	.description('Clear all files from ./src folder (with confirmation)')
	.option('-s, --silent', 'Silent/raw mode - suppress decorative output')
	.option('-r, --raw', 'Alias for --silent')
	.action(clearAction)

// Command to push local changes back to ScriptForge
program
	.command('push')
	.description('Push local ./src changes to ScriptForge (creates/updates)')
	.option('-s, --silent', 'Silent/raw mode - suppress decorative output')
	.option('-r, --raw', 'Alias for --silent')
	.action(pushAction)

// Default action when no command is specified
program
	.action(() => {
		console.log('Welcome to connexcs-tools!')
		console.log('Run "cx configure" to set up your credentials.')
		console.log('Run "cx configure:app" to select an app.')
		console.log('Run "cx run <id>" to execute a ScriptForge script.')
		console.log('Run "cx sql <query>" to execute SQL queries on CDR database.')
		console.log('Run "cx kv:list" to list all KV keys.')
		console.log('Run "cx kv:get <id>" to get a KV record.')
		console.log('Run "cx kv:set <id>" to set a KV record.')
		console.log('Run "cx kv:del <id>" to delete a KV record.')
		console.log('Run "cx env:list" to list all environment variables.')
		console.log('Run "cx env:get <id>" to get an environment variable.')
		console.log('Run "cx env:set <id>" to set an environment variable.')
		console.log('Run "cx env:del <id>" to delete an environment variable.')
		console.log('Run "cx pull" to download ScriptForge scripts to ./src')
		console.log('Run "cx push" to upload local changes to ScriptForge')
		console.log('Run "cx clear" to clear the ./src folder')
		console.log('Use "cx --help" to see available commands.')
	})

program.parse(process.argv)

// If no command was provided, show the default message
if (!process.argv.slice(2).length) {
	program.outputHelp()
}