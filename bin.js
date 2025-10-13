#!/usr/bin/env node

import { program } from 'commander'
import { configureAction } from './lib/configure.js'
import { configDotenv } from 'dotenv'
	
configDotenv()

program
	.name('cx-tools')
	.description('ConnexCS.com Tools')
	.version('1.0.0')

// Command to configure credentials
program
	.command('configure')
	.description('Configure username and password credentials')
	.option('-u, --username <username>', 'Username for authentication')
	.option('-p, --password <password>', 'Password for authentication')
	.option('-f, --force', 'Force overwrite existing .env file')
	.action(configureAction)

// Default action when no command is specified
program
	.action(() => {
		console.log('Welcome to cx-tools!')
		console.log('Run "cx-tools configure" to set up your credentials.')
		console.log('Use "cx-tools --help" to see available commands.')
	})

program.parse(process.argv)

// If no command was provided, show the default message
if (!process.argv.slice(2).length) {
	program.outputHelp()
}