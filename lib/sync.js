import { confirm } from '@inquirer/prompts'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import {
	makeAuthenticatedRequest,
	handleError
} from './utils.js'

const SRC_DIR = './src'

/**
 * Fetches all ScriptForge scripts from the API
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Array>} Array of script objects with id, name, app_id (without code)
 */
async function fetchAllScripts(silent = false) {
	if (!silent) {
		console.log('📡 Fetching ScriptForge scripts...')
	}
	
	const result = await makeAuthenticatedRequest('scriptforge', 'GET', null, silent)
	
	if (!result.success) {
		throw new Error(result.error)
	}
	
	return result.data || []
}

/**
 * Fetches a single ScriptForge script by ID (includes code)
 * @param {number} id - Script ID
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Object>} Script object with id, name, code, app_id
 */
async function fetchScriptById(id, silent = false) {
	const result = await makeAuthenticatedRequest(`scriptforge/${id}`, 'GET', null, silent)
	
	if (!result.success) {
		throw new Error(result.error)
	}
	
	return result.data
}

/**
 * Filters scripts by configured APP_ID
 * @param {Array} scripts - Array of script objects
 * @returns {Array} Filtered scripts
 */
function filterByAppId(scripts) {
	const appId = process.env.APP_ID
	
	if (!appId) {
		console.log('⚠️  No APP_ID configured. Use "cx configure:app" to set one.')
		console.log('📋 Showing all scripts...')
		return scripts
	}
	
	// Handle both string UUIDs and integer IDs
	const filtered = scripts.filter(script => {
		return String(script.app_id) === String(appId)
	})
	console.log(`🔍 Filtered by APP_ID: ${appId} (${filtered.length} scripts)`)
	
	return filtered
}

/**
 * Pull command - downloads ScriptForge scripts to ./src folder
 * @param {Object} options - Command options
 */
export async function pullAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		// Fetch all scripts (list view - without code)
		const allScripts = await fetchAllScripts(silent)
		const scripts = filterByAppId(allScripts)
		
		if (scripts.length === 0) {
			console.log('📭 No scripts found.')
			return
		}
		
		// Show what will be pulled
		console.log('\n📥 Files to be pulled:')
		console.log('═'.repeat(50))
		scripts.forEach(script => {
			const filename = `${script.name}.js`
			console.log(`  • ${filename} (ID: ${script.id})`)
		})
		console.log('═'.repeat(50))
		console.log(`📊 Total: ${scripts.length} file(s)`)
		
		// Confirm operation
		const shouldProceed = await confirm({
			message: `Pull ${scripts.length} file(s) to ${SRC_DIR}?`,
			default: true
		})
		
		if (!shouldProceed) {
			console.log('❌ Pull cancelled.')
			return
		}
		
		// Create src directory if it doesn't exist
		if (!existsSync(SRC_DIR)) {
			mkdirSync(SRC_DIR, { recursive: true })
			console.log(`📁 Created ${SRC_DIR} directory`)
		}
		
		// Fetch and write each script to a file
		let successCount = 0
		for (const script of scripts) {
			const filename = `${script.name}.js`
			const filepath = join(SRC_DIR, filename)
			
			try {
				// Fetch the full script details including code
				if (!silent) {
					console.log(`📥 Fetching ${filename}...`)
				}
				const fullScript = await fetchScriptById(script.id, silent)
				
				writeFileSync(filepath, fullScript.code || '', 'utf-8')
				console.log(`✅ ${filename}`)
				successCount++
			} catch (error) {
				console.error(`❌ Failed to write ${filename}: ${error.message}`)
			}
		}
		
		console.log(`\n🎉 Successfully pulled ${successCount}/${scripts.length} file(s) to ${SRC_DIR}`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}

/**
 * Clear command - clears the ./src folder after confirmation
 * @param {Object} options - Command options
 */
export async function clearAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		// Check if src directory exists
		if (!existsSync(SRC_DIR)) {
			console.log(`📁 ${SRC_DIR} directory does not exist. Nothing to clear.`)
			return
		}
		
		// Get list of files
		const files = readdirSync(SRC_DIR).filter(file => {
			const filepath = join(SRC_DIR, file)
			return statSync(filepath).isFile()
		})
		
		if (files.length === 0) {
			console.log(`📁 ${SRC_DIR} is already empty.`)
			return
		}
		
		// Show what will be deleted
		console.log('\n🗑️  Files to be deleted:')
		console.log('═'.repeat(50))
		files.forEach(file => {
			console.log(`  • ${file}`)
		})
		console.log('═'.repeat(50))
		console.log(`📊 Total: ${files.length} file(s)`)
		
		// Confirm deletion
		const shouldProceed = await confirm({
			message: `⚠️  Delete all ${files.length} file(s) from ${SRC_DIR}?`,
			default: false
		})
		
		if (!shouldProceed) {
			console.log('❌ Clear cancelled.')
			return
		}
		
		// Delete all files in the directory
		let deletedCount = 0
		for (const file of files) {
			const filepath = join(SRC_DIR, file)
			try {
				rmSync(filepath)
				console.log(`✅ Deleted ${file}`)
				deletedCount++
			} catch (error) {
				console.error(`❌ Failed to delete ${file}: ${error.message}`)
			}
		}
		
		console.log(`\n🎉 Successfully deleted ${deletedCount}/${files.length} file(s) from ${SRC_DIR}`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}

/**
 * Push command - syncs local files back to ScriptForge
 * @param {Object} options - Command options
 */
export async function pushAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		// Check if src directory exists
		if (!existsSync(SRC_DIR)) {
			console.log(`📁 ${SRC_DIR} directory does not exist. Nothing to push.`)
			console.log(`💡 Use "cx pull" to download scripts first.`)
			return
		}
		
		// Get local files
		const localFiles = readdirSync(SRC_DIR)
			.filter(file => file.endsWith('.js'))
			.map(file => ({
				filename: file,
				name: basename(file, '.js'),
				filepath: join(SRC_DIR, file),
				code: readFileSync(join(SRC_DIR, file), 'utf-8')
			}))
		
		if (localFiles.length === 0) {
			console.log(`📁 No .js files found in ${SRC_DIR}`)
			return
		}
		
		// Fetch remote scripts to get IDs and compare
		if (!silent) {
			console.log('📡 Fetching remote scripts for comparison...')
		}
		
		const allRemoteScripts = await fetchAllScripts(silent)
		const remoteScripts = filterByAppId(allRemoteScripts)
		
		// Fetch full details for each remote script (including code)
		if (!silent) {
			console.log('📡 Fetching script details...')
		}
		
		const remoteMap = new Map()
		for (const script of remoteScripts) {
			try {
				const fullScript = await fetchScriptById(script.id, true) // silent=true for individual fetches
				remoteMap.set(fullScript.name, {
					id: fullScript.id,
					code: fullScript.code || '',
					app_id: fullScript.app_id
				})
			} catch (error) {
				console.error(`⚠️  Failed to fetch ${script.name}: ${error.message}`)
			}
		}
		
		// Determine what needs to be updated or created
		const toUpdate = []
		const toCreate = []
		
		for (const localFile of localFiles) {
			const remote = remoteMap.get(localFile.name)
			
			if (remote) {
				// File exists remotely - check if code changed
				if (remote.code !== localFile.code) {
					toUpdate.push({
						...localFile,
						id: remote.id,
						app_id: remote.app_id
					})
				}
			} else {
				// New file
				toCreate.push(localFile)
			}
		}
		
		const totalChanges = toUpdate.length + toCreate.length
		
		if (totalChanges === 0) {
			console.log('✅ Everything is up to date. No changes to push.')
			return
		}
		
		// Show what will be pushed
		console.log('\n📤 Changes to be pushed:')
		console.log('═'.repeat(50))
		
		if (toUpdate.length > 0) {
			console.log('📝 Files to UPDATE:')
			toUpdate.forEach(file => {
				console.log(`  • ${file.filename} (ID: ${file.id})`)
			})
		}
		
		if (toCreate.length > 0) {
			console.log('✨ Files to CREATE:')
			toCreate.forEach(file => {
				console.log(`  • ${file.filename}`)
			})
		}
		
		console.log('═'.repeat(50))
		console.log(`📊 Total: ${totalChanges} change(s) (${toUpdate.length} update, ${toCreate.length} create)`)
		
		// Confirm operation
		const shouldProceed = await confirm({
			message: `Push ${totalChanges} change(s) to ScriptForge?`,
			default: true
		})
		
		if (!shouldProceed) {
			console.log('❌ Push cancelled.')
			return
		}
		
		let successCount = 0
		
		// Update existing files
		for (const file of toUpdate) {
			try {
				const result = await makeAuthenticatedRequest(
					`scriptforge/${file.id}`,
					'PUT',
					{ 
						name: file.name,
						code: file.code,
						app_id: file.app_id
					},
					silent
				)
				
				if (result.success) {
					console.log(`✅ Updated ${file.filename}`)
					successCount++
				} else {
					console.error(`❌ Failed to update ${file.filename}: ${result.error}`)
				}
			} catch (error) {
				console.error(`❌ Failed to update ${file.filename}: ${error.message}`)
			}
		}
		
		// Create new files
		for (const file of toCreate) {
			try {
				// Get APP_ID from environment or use the first remote script's app_id
				const appId = process.env.APP_ID 
					? parseInt(process.env.APP_ID)
					: (remoteScripts.length > 0 ? remoteScripts[0].app_id : null)
				
				if (!appId) {
					console.error(`❌ Cannot create ${file.filename}: No APP_ID configured. Use "cx configure:app" first.`)
					continue
				}
				
				const result = await makeAuthenticatedRequest(
					'scriptforge',
					'POST',
					{
						name: file.name,
						code: file.code,
						app_id: appId
					},
					silent
				)
				
				if (result.success) {
					console.log(`✅ Created ${file.filename}`)
					successCount++
				} else {
					console.error(`❌ Failed to create ${file.filename}: ${result.error}`)
				}
			} catch (error) {
				console.error(`❌ Failed to create ${file.filename}: ${error.message}`)
			}
		}
		
		console.log(`\n🎉 Successfully pushed ${successCount}/${totalChanges} change(s)`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}
