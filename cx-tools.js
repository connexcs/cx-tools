#!/usr/bin/env node

import { program } from 'commander'
import { configureAction } from './lib/configure.js'
import { runAction } from './lib/run.js'
import { sqlAction } from './lib/sql.js'
import { kvListAction, kvGetAction, kvSetAction, kvDelAction } from './lib/kv.js'
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
	.description('Configure username and password credentials')
	.option('-u, --username <username>', 'Username for authentication')
	.option('-p, --password <password>', 'Password for authentication')
	.option('-f, --force', 'Force overwrite existing .env file')
	.action(configureAction)

// Command to run ScriptForge scripts
program
	.command('run [id]')
	.description('Execute a ScriptForge script by ID')
	.option('-b, --body [body]', 'Include JSON request body (optionally provide JSON string or file path)')
	.option('-s, --silent', 'Silent/raw mode - output only response data without formatting (suitable for piping)')
	.option('-r, --raw', 'Alias for --silent')
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

// Default action when no command is specified
program
	.action(() => {
		console.log('Welcome to connexcs-tools!')
		console.log('Run "cx configure" to set up your credentials.')
		console.log('Run "cx run <id>" to execute a ScriptForge script.')
		console.log('Run "cx sql <query>" to execute SQL queries on CDR database.')
		console.log('Run "cx kv:list" to list all KV keys.')
		console.log('Run "cx kv:get <id>" to get a KV record.')
		console.log('Run "cx kv:set <id>" to set a KV record.')
		console.log('Run "cx kv:del <id>" to delete a KV record.')
		console.log('Use "cx --help" to see available commands.')
	})

program.parse(process.argv)

// If no command was provided, show the default message
if (!process.argv.slice(2).length) {
	program.outputHelp()
}