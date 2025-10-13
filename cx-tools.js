#!/usr/bin/env node

import { program } from 'commander'
import { configureAction } from './lib/configure.js'
import { runAction } from './lib/run.js'
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

// Default action when no command is specified
program
	.action(() => {
		console.log('Welcome to cx-tools!')
		console.log('Run "cx-tools configure" to set up your credentials.')
		console.log('Run "cx-tools run <id>" to execute a ScriptForge script.')
		console.log('Use "cx-tools --help" to see available commands.')
	})

program.parse(process.argv)

// If no command was provided, show the default message
if (!process.argv.slice(2).length) {
	program.outputHelp()
}