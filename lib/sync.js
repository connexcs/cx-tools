import { confirm, select } from '@inquirer/prompts'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createTwoFilesPatch } from 'diff'
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
 * Colorizes diff output for better readability
 * @param {string} line - A line from the diff output
 * @returns {string} Colorized line
 */
function colorizeDiffLine(line) {
	if (line.startsWith('+') && !line.startsWith('+++')) {
		return `\x1b[32m${line}\x1b[0m` // Green for additions
	} else if (line.startsWith('-') && !line.startsWith('---')) {
		return `\x1b[31m${line}\x1b[0m` // Red for deletions
	} else if (line.startsWith('@@')) {
		return `\x1b[36m${line}\x1b[0m` // Cyan for line numbers
	} else if (line.startsWith('+++') || line.startsWith('---')) {
		return `\x1b[1m${line}\x1b[0m` // Bold for file headers
	}
	return line
}

/**
 * Displays a diff between two versions of a file
 * @param {string} filename - Name of the file
 * @param {string} oldContent - Original content
 * @param {string} newContent - New content
 * @param {string} oldLabel - Label for old version (e.g., "Remote", "Local")
 * @param {string} newLabel - Label for new version (e.g., "Local", "Remote")
 */
function displayDiff(filename, oldContent, newContent, oldLabel = 'Remote', newLabel = 'Local') {
	const patch = createTwoFilesPatch(
		filename,
		filename,
		oldContent,
		newContent,
		oldLabel,
		newLabel
	)
	
	const lines = patch.split('\n')
	
	console.log(`\n${'═'.repeat(70)}`)
	console.log(`📄 ${filename}`)
	console.log('─'.repeat(70))
	
	// Skip the first two lines (file headers) and display the rest with colors
	for (let i = 2; i < lines.length; i++) {
		if (lines[i]) {
			console.log(colorizeDiffLine(lines[i]))
		}
	}
	
	console.log('═'.repeat(70))
}

/**
 * Shows diffs for files that will be updated during pull
 * @param {Array} itemsWithDiffs - Array of items with local and remote content
 * @param {boolean} showDiffs - Whether to show diffs
 * @returns {Promise<boolean>} Whether user wants to continue
 */
async function showPullDiffs(itemsWithDiffs, showDiffs = false) {
	if (itemsWithDiffs.length === 0) {
		return true
	}
	
	if (!showDiffs) {
		// Just show summary
		console.log(`\n⚠️  ${itemsWithDiffs.length} file(s) will be overwritten:`)
		itemsWithDiffs.forEach(item => {
			console.log(`    • ${item.filename}`)
		})
		return true
	}
	
	// Show diffs
	console.log(`\n📋 Showing diffs for ${itemsWithDiffs.length} file(s) that will be updated:\n`)
	
	for (const item of itemsWithDiffs) {
		displayDiff(item.filename, item.localContent, item.remoteContent, 'Local (current)', 'Remote (will download)')
	}
	
	return true
}

/**
 * Shows diffs for files that will be updated during push
 * @param {Array} filesToUpdate - Array of files to update with remote content
 * @param {Map} remoteMap - Map of remote file contents
 * @param {boolean} showDiffs - Whether to show diffs
 * @returns {Promise<boolean>} Whether user wants to continue
 */
async function showPushDiffs(filesToUpdate, remoteMap, showDiffs = false) {
	if (filesToUpdate.length === 0 || !showDiffs) {
		return true
	}
	
	console.log(`\n📋 Showing diffs for ${filesToUpdate.length} file(s) that will be updated:\n`)
	
	for (const file of filesToUpdate) {
		const remote = remoteMap.get(file.name)
		if (remote) {
			displayDiff(file.filename, remote.content, file.content, 'Remote (current)', 'Local (will upload)')
		}
	}
	
	return true
}

/**
 * Generic pull function for a specific sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @param {boolean} preview - If true, only show what would be pulled without actually pulling
 * @returns {Promise<Object>} Results with items, pulled count, total, and itemsWithDiffs
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
		return { items: [], pulled: 0, total: 0, itemsWithDiffs: [] }
	}
	
	// If preview, fetch items and check for local differences
	const itemsWithDiffs = []
	
	for (const item of items) {
		const filename = `${item.name}${config.extension}`
		const filepath = join(config.dir, filename)
		
		// Fetch the full item details including content
		const fullItem = await fetchItemById(syncType, item.id, true)
		const remoteContent = fullItem[config.contentField] || ''
		
		// Check if file exists locally and has different content
		if (existsSync(filepath)) {
			const localContent = readFileSync(filepath, 'utf-8')
			if (localContent !== remoteContent) {
				itemsWithDiffs.push({
					filename,
					filepath,
					localContent,
					remoteContent,
					item: fullItem
				})
			}
		}
		
		// Store the fetched item for later use
		item._fullItem = fullItem
	}
	
	// If preview, just return the analysis
	if (preview) {
		return { items, pulled: 0, total: items.length, itemsWithDiffs }
	}
	
	// Create directory if it doesn't exist
	if (!existsSync(config.dir)) {
		mkdirSync(config.dir, { recursive: true })
		if (!silent) {
			console.log(`📁 Created ${config.dir} directory`)
		}
	}
	
	// Write each item to a file
	let successCount = 0
	for (const item of items) {
		const filename = `${item.name}${config.extension}`
		const filepath = join(config.dir, filename)
		
		try {
			// Use the previously fetched full item
			const fullItem = item._fullItem
			const content = fullItem[config.contentField] || ''
			
			writeFileSync(filepath, content, 'utf-8')
			console.log(`✅ ${filename}`)
			successCount++
		} catch (error) {
			console.error(`❌ Failed to write ${filename}: ${error.message}`)
		}
	}
	
	return { items, pulled: successCount, total: items.length, itemsWithDiffs }
}

/**
 * Pull command - downloads ScriptForge scripts and SQL queries
 * @param {Object} options - Command options
 */
export async function pullAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		console.log('🔄 Starting pull operation...\n')
		
		// First, do a preview to analyze changes
		const scriptResults = await pullItems('scriptforge', silent, true)
		const queryResults = await pullItems('query', silent, true)
		
		const totalItems = scriptResults.total + queryResults.total
		const allItemsWithDiffs = [...scriptResults.itemsWithDiffs, ...queryResults.itemsWithDiffs]
		
		if (totalItems === 0) {
			console.log('\n📭 No items found to pull.')
			return
		}
		
		// Show summary
		console.log('\n📥 Files to be pulled:')
		console.log('══════════════════════════════════════════════════')
		
		if (scriptResults.total > 0) {
			console.log(`\n📜 ScriptForge Scripts: ${scriptResults.total} file(s)`)
			scriptResults.items.forEach(item => {
				const filename = `${item.name}.js`
				const hasLocalDiff = scriptResults.itemsWithDiffs.some(d => d.filename === filename)
				console.log(`  • ${filename}${hasLocalDiff ? ' ⚠️  (will overwrite local changes)' : ''}`)
			})
		}
		
		if (queryResults.total > 0) {
			console.log(`\n🗄️  SQL Queries: ${queryResults.total} file(s)`)
			queryResults.items.forEach(item => {
				const filename = `${item.name}.sql`
				const hasLocalDiff = queryResults.itemsWithDiffs.some(d => d.filename === filename)
				console.log(`  • ${filename}${hasLocalDiff ? ' ⚠️  (will overwrite local changes)' : ''}`)
			})
		}
		
		console.log('\n══════════════════════════════════════════════════')
		console.log(`📊 Total: ${totalItems} file(s) (${scriptResults.total} scripts, ${queryResults.total} queries)`)
		
		if (allItemsWithDiffs.length > 0) {
			console.log(`⚠️  Warning: ${allItemsWithDiffs.length} file(s) have local changes that will be overwritten`)
		}
		
		// Ask if user wants to view diffs
		let viewDiffs = false
		if (allItemsWithDiffs.length > 0 && !silent) {
			const diffChoice = await select({
				message: 'Files with local changes detected. What would you like to do?',
				choices: [
					{ name: 'View diffs before proceeding', value: 'view' },
					{ name: 'Continue without viewing diffs', value: 'skip' },
					{ name: 'Cancel pull operation', value: 'cancel' }
				],
				default: 'view'
			})
			
			if (diffChoice === 'cancel') {
				console.log('❌ Pull cancelled.')
				return
			}
			
			viewDiffs = diffChoice === 'view'
			
			if (viewDiffs) {
				await showPullDiffs(allItemsWithDiffs, true)
			}
		}
		
		// Confirm operation
		const shouldProceed = await confirm({
			message: `Pull ${totalItems} file(s)?`,
			default: true
		})
		
		if (!shouldProceed) {
			console.log('❌ Pull cancelled.')
			return
		}
		
		// Now perform the actual pull
		console.log('\n📥 Pulling files...\n')
		const scriptPullResults = await pullItems('scriptforge', silent, false)
		const queryPullResults = await pullItems('query', silent, false)
		
		const totalPulled = scriptPullResults.pulled + queryPullResults.pulled
		
		console.log(`\n🎉 Successfully pulled ${totalPulled}/${totalItems} file(s)`)
		console.log(`   └─ ${scriptPullResults.pulled}/${scriptPullResults.total} ScriptForge scripts → ${SRC_DIR}`)
		console.log(`   └─ ${queryPullResults.pulled}/${queryPullResults.total} SQL queries → ${QUERY_DIR}`)
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
 * @returns {Promise<Object>} Results with toUpdate, toCreate, successCount, remoteMap
 */
async function pushItems(syncType, silent = false) {
	const config = SYNC_TYPES[syncType]
	
	// Check if directory exists
	if (!existsSync(config.dir)) {
		return { toUpdate: [], toCreate: [], successCount: 0, totalChanges: 0, remoteMap: new Map() }
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
		return { toUpdate: [], toCreate: [], successCount: 0, totalChanges: 0, remoteMap: new Map() }
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
	
	return { toUpdate, toCreate, successCount: 0, totalChanges: toUpdate.length + toCreate.length, remoteMap }
}

/**
 * Push command - syncs local files back to ScriptForge and SQL queries
 * @param {Object} options - Command options
 */
export async function pushAction(options) {
	try {
		const silent = options.silent || options.raw || false
		
		console.log('🔄 Starting push operation...\n')
		
		// Analyze changes for both types
		const scriptResults = await pushItems('scriptforge', silent)
		const queryResults = await pushItems('query', silent)
		
		const allToUpdate = [...scriptResults.toUpdate, ...queryResults.toUpdate]
		const allToCreate = [...scriptResults.toCreate, ...queryResults.toCreate]
		const totalChanges = allToUpdate.length + allToCreate.length
		
		// Combine remote maps
		const allRemoteMaps = new Map([...scriptResults.remoteMap, ...queryResults.remoteMap])
		
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
		
		// Ask if user wants to view diffs for updates
		if (allToUpdate.length > 0 && !silent) {
			const diffChoice = await select({
				message: 'Would you like to view diffs before pushing?',
				choices: [
					{ name: 'View diffs for files to be updated', value: 'view' },
					{ name: 'Continue without viewing diffs', value: 'skip' },
					{ name: 'Cancel push operation', value: 'cancel' }
				],
				default: 'view'
			})
			
			if (diffChoice === 'cancel') {
				console.log('❌ Push cancelled.')
				return
			}
			
			if (diffChoice === 'view') {
				await showPushDiffs(allToUpdate, allRemoteMaps, true)
			}
		}
		
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
