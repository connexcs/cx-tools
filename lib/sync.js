import { confirm } from '@inquirer/prompts'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import {
	makeAuthenticatedRequest,
	handleError
} from './utils.js'

const SRC_DIR = './src'
const QUERY_DIR = './query'

// Configuration for different sync types
const SYNC_TYPES = {
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

/**
 * Fetches all items from the API for a given sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Array>} Array of item objects (without content)
 */
async function fetchAllItems(syncType, silent = false) {
	const config = SYNC_TYPES[syncType]
	
	if (!silent) {
		console.log(`📡 Fetching ${config.displayNamePlural}...`)
	}
	
	const result = await makeAuthenticatedRequest(config.endpoint, 'GET', null, silent)
	
	if (!result.success) {
		throw new Error(result.error)
	}
	
	return result.data || []
}

/**
 * Fetches a single item by ID (includes content)
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {number} id - Item ID
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Object>} Item object with id, name, content field, app_id
 */
async function fetchItemById(syncType, id, silent = false) {
	const config = SYNC_TYPES[syncType]
	const result = await makeAuthenticatedRequest(`${config.endpoint}/${id}`, 'GET', null, silent)
	
	if (!result.success) {
		throw new Error(result.error)
	}
	
	return result.data
}

/**
 * Filters items by configured APP_ID
 * @param {Array} items - Array of item objects
 * @param {string} syncType - Type of sync for display messages
 * @returns {Array} Filtered items
 */
function filterByAppId(items, syncType) {
	const config = SYNC_TYPES[syncType]
	const appId = process.env.APP_ID
	
	if (!appId) {
		console.log('⚠️  No APP_ID configured. Use "cx configure:app" to set one.')
		console.log(`📋 Showing all ${config.displayNamePlural}...`)
		return items
	}
	
	// Handle both string UUIDs and integer IDs
	const filtered = items.filter(item => {
		return String(item.app_id) === String(appId)
	})
	console.log(`🔍 Filtered by APP_ID: ${appId} (${filtered.length} ${config.displayNamePlural})`)
	
	return filtered
}

/**
 * Generic pull function for a specific sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @param {boolean} preview - If true, only show what would be pulled without actually pulling
 */
async function pullItems(syncType, silent = false, preview = false) {
	const config = SYNC_TYPES[syncType]
	
	// Fetch all items (list view - without content)
	const allItems = await fetchAllItems(syncType, silent)
	const items = filterByAppId(allItems, syncType)
	
	if (items.length === 0) {
		if (!preview) {
			console.log(`📭 No ${config.displayNamePlural} found.`)
		}
		return { items: [], pulled: 0, total: 0 }
	}
	
	// If preview, just return the items
	if (preview) {
		return { items, pulled: 0, total: items.length }
	}
	
	// Create directory if it doesn't exist
	if (!existsSync(config.dir)) {
		mkdirSync(config.dir, { recursive: true })
		if (!silent) {
			console.log(`📁 Created ${config.dir} directory`)
		}
	}
	
	// Fetch and write each item to a file
	let successCount = 0
	for (const item of items) {
		const filename = `${item.name}${config.extension}`
		const filepath = join(config.dir, filename)
		
		try {
			// Fetch the full item details including content
			if (!silent) {
				console.log(`📥 Fetching ${filename}...`)
			}
			const fullItem = await fetchItemById(syncType, item.id, silent)
			
			const content = fullItem[config.contentField] || ''
			writeFileSync(filepath, content, 'utf-8')
			console.log(`✅ ${filename}`)
			successCount++
		} catch (error) {
			console.error(`❌ Failed to write ${filename}: ${error.message}`)
		}
	}
	
	return { items, pulled: successCount, total: items.length }
}

/**
 * Pull command - downloads ScriptForge scripts and SQL queries
 * @param {Object} options - Command options
 */
export async function pullAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		console.log('� Starting pull operation...\n')
		
		// Pull ScriptForge scripts
		const scriptResults = await pullItems('scriptforge', silent)
		
		// Pull SQL queries
		const queryResults = await pullItems('query', silent)
		
		// Show summary
		const totalPulled = scriptResults.pulled + queryResults.pulled
		const totalItems = scriptResults.total + queryResults.total
		
		if (totalItems === 0) {
			console.log('\n📭 No items found to pull.')
			return
		}
		
		// Confirm operation
		console.log('\n══════════════════════════════════════════════════')
		console.log(`📊 Total: ${totalItems} file(s) (${scriptResults.total} scripts, ${queryResults.total} queries)`)
		
		const shouldProceed = await confirm({
			message: `Pull ${totalItems} file(s)?`,
			default: true
		})
		
		if (!shouldProceed) {
			console.log('❌ Pull cancelled.')
			return
		}
		
		console.log(`\n🎉 Successfully pulled ${totalPulled}/${totalItems} file(s)`)
		console.log(`   └─ ${scriptResults.pulled}/${scriptResults.total} ScriptForge scripts → ${SRC_DIR}`)
		console.log(`   └─ ${queryResults.pulled}/${queryResults.total} SQL queries → ${QUERY_DIR}`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}

/**
 * Clear command - clears both ./src and ./query folders after confirmation
 * @param {Object} options - Command options
 */
export async function clearAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		const allFiles = []
		
		// Check both directories and collect files
		for (const [syncType, config] of Object.entries(SYNC_TYPES)) {
			if (existsSync(config.dir)) {
				const files = readdirSync(config.dir).filter(file => {
					const filepath = join(config.dir, file)
					return statSync(filepath).isFile() && file.endsWith(config.extension)
				})
				
				files.forEach(file => {
					allFiles.push({ dir: config.dir, file, type: config.displayNamePlural })
				})
			}
		}
		
		if (allFiles.length === 0) {
			console.log(`📁 No files found in ${SRC_DIR} or ${QUERY_DIR}`)
			return
		}
		
		// Show what will be deleted
		console.log('\n🗑️  Files to be deleted:')
		console.log('═'.repeat(50))
		allFiles.forEach(({ dir, file }) => {
			console.log(`  • ${dir}/${file}`)
		})
		console.log('═'.repeat(50))
		console.log(`📊 Total: ${allFiles.length} file(s)`)
		
		// Confirm deletion
		const shouldProceed = await confirm({
			message: `⚠️  Delete all ${allFiles.length} file(s)?`,
			default: false
		})
		
		if (!shouldProceed) {
			console.log('❌ Clear cancelled.')
			return
		}
		
		// Delete all files
		let deletedCount = 0
		for (const { dir, file } of allFiles) {
			const filepath = join(dir, file)
			try {
				rmSync(filepath)
				console.log(`✅ Deleted ${dir}/${file}`)
				deletedCount++
			} catch (error) {
				console.error(`❌ Failed to delete ${file}: ${error.message}`)
			}
		}
		
		console.log(`\n🎉 Successfully deleted ${deletedCount}/${allFiles.length} file(s)`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}

/**
 * Generic push function for a specific sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Object>} Results with toUpdate, toCreate, successCount
 */
async function pushItems(syncType, silent = false) {
	const config = SYNC_TYPES[syncType]
	
	// Check if directory exists
	if (!existsSync(config.dir)) {
		return { toUpdate: [], toCreate: [], successCount: 0, totalChanges: 0 }
	}
	
	// Get local files
	const localFiles = readdirSync(config.dir)
		.filter(file => file.endsWith(config.extension))
		.map(file => ({
			filename: file,
			name: basename(file, config.extension),
			filepath: join(config.dir, file),
			content: readFileSync(join(config.dir, file), 'utf-8')
		}))
	
	if (localFiles.length === 0) {
		return { toUpdate: [], toCreate: [], successCount: 0, totalChanges: 0 }
	}
	
	// Fetch remote items to get IDs and compare
	if (!silent) {
		console.log(`📡 Fetching remote ${config.displayNamePlural} for comparison...`)
	}
	
	const allRemoteItems = await fetchAllItems(syncType, silent)
	const remoteItems = filterByAppId(allRemoteItems, syncType)
	
	// Fetch full details for each remote item (including content)
	if (!silent) {
		console.log(`📡 Fetching ${config.displayName} details...`)
	}
	
	const remoteMap = new Map()
	for (const item of remoteItems) {
		try {
			const fullItem = await fetchItemById(syncType, item.id, true) // silent=true for individual fetches
			remoteMap.set(fullItem.name, {
				id: fullItem.id,
				content: fullItem[config.contentField] || '',
				app_id: fullItem.app_id
			})
		} catch (error) {
			console.error(`⚠️  Failed to fetch ${item.name}: ${error.message}`)
		}
	}
	
	// Determine what needs to be updated or created
	const toUpdate = []
	const toCreate = []
	
	for (const localFile of localFiles) {
		const remote = remoteMap.get(localFile.name)
		
		if (remote) {
			// File exists remotely - check if content changed
			if (remote.content !== localFile.content) {
				toUpdate.push({
					...localFile,
					id: remote.id,
					app_id: remote.app_id,
					syncType
				})
			}
		} else {
			// New file
			toCreate.push({
				...localFile,
				syncType
			})
		}
	}
	
	return { toUpdate, toCreate, successCount: 0, totalChanges: toUpdate.length + toCreate.length }
}

/**
 * Push command - syncs local files back to ScriptForge and SQL queries
 * @param {Object} options - Command options
 */
export async function pushAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		console.log('� Starting push operation...\n')
		
		// Analyze changes for both types
		const scriptResults = await pushItems('scriptforge', silent)
		const queryResults = await pushItems('query', silent)
		
		const allToUpdate = [...scriptResults.toUpdate, ...queryResults.toUpdate]
		const allToCreate = [...scriptResults.toCreate, ...queryResults.toCreate]
		const totalChanges = allToUpdate.length + allToCreate.length
		
		if (totalChanges === 0) {
			console.log('✅ Everything is up to date. No changes to push.')
			return
		}
		
		// Show what will be pushed
		console.log('\n📤 Changes to be pushed:')
		console.log('══════════════════════════════════════════════════')
		
		if (scriptResults.totalChanges > 0) {
			console.log('\n📜 ScriptForge Scripts:')
			if (scriptResults.toUpdate.length > 0) {
				console.log('  📝 To UPDATE:')
				scriptResults.toUpdate.forEach(file => {
					console.log(`    • ${file.filename} (ID: ${file.id})`)
				})
			}
			if (scriptResults.toCreate.length > 0) {
				console.log('  ✨ To CREATE:')
				scriptResults.toCreate.forEach(file => {
					console.log(`    • ${file.filename}`)
				})
			}
		}
		
		if (queryResults.totalChanges > 0) {
			console.log('\n🗄️  SQL Queries:')
			if (queryResults.toUpdate.length > 0) {
				console.log('  📝 To UPDATE:')
				queryResults.toUpdate.forEach(file => {
					console.log(`    • ${file.filename} (ID: ${file.id})`)
				})
			}
			if (queryResults.toCreate.length > 0) {
				console.log('  ✨ To CREATE:')
				queryResults.toCreate.forEach(file => {
					console.log(`    • ${file.filename}`)
				})
			}
		}
		
		console.log('\n══════════════════════════════════════════════════')
		console.log(`📊 Total: ${totalChanges} change(s) (${allToUpdate.length} update, ${allToCreate.length} create)`)
		
		// Confirm operation
		const shouldProceed = await confirm({
			message: `Push ${totalChanges} change(s)?`,
			default: true
		})
		
		if (!shouldProceed) {
			console.log('❌ Push cancelled.')
			return
		}
		
		let successCount = 0
		
		// Process all updates
		for (const file of allToUpdate) {
			try {
				const config = SYNC_TYPES[file.syncType]
				const body = {
					name: file.name,
					[config.contentField]: file.content,
					app_id: file.app_id
				}
				
				const result = await makeAuthenticatedRequest(
					`${config.endpoint}/${file.id}`,
					'PUT',
					body,
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
		
		// Process all creates
		for (const file of allToCreate) {
			try {
				const config = SYNC_TYPES[file.syncType]
				
				// Get APP_ID from environment
				const appId = process.env.APP_ID
				
				if (!appId) {
					console.error(`❌ Cannot create ${file.filename}: No APP_ID configured. Use "cx configure:app" first.`)
					continue
				}
				
				const body = {
					name: file.name,
					[config.contentField]: file.content,
					app_id: appId
				}
				
				const result = await makeAuthenticatedRequest(
					config.endpoint,
					'POST',
					body,
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
