/**
 * File-based sync functions for ScriptForge and SQL queries
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import { makeAuthenticatedRequest } from '../utils.js'
import { SYNC_TYPES, SRC_DIR, QUERY_DIR } from './constants.js'

/**
 * Fetches all items from the API for a given sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Array>} Array of item objects (without content)
 */
export async function fetchAllItems(syncType, silent = false) {
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
export async function fetchItemById(syncType, id, silent = false) {
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
export function filterByAppId(items, syncType) {
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
 * @returns {Promise<Object>} Results with items, pulled count, total, and itemsWithDiffs
 */
export async function pullItems(syncType, silent = false, preview = false) {
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
	
	// Fetch all items in parallel
	if (!silent && items.length > 1) {
		console.log(`📥 Fetching ${items.length} ${config.displayNamePlural} in parallel...`)
	}
	
	const fetchPromises = items.map(item => 
		fetchItemById(syncType, item.id, true)
			.then(fullItem => ({ item, fullItem, success: true }))
			.catch(error => ({ item, error, success: false }))
	)
	
	const results = await Promise.all(fetchPromises)
	
	// Process results and check for local differences
	const itemsWithDiffs = []
	
	for (const result of results) {
		if (!result.success) {
			console.error(`⚠️  Failed to fetch ${result.item.name}: ${result.error.message}`)
			continue
		}
		
		const { item, fullItem } = result
		const filename = `${item.name}${config.extension}`
		const filepath = join(config.dir, filename)
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
			if (!fullItem) {
				console.error(`❌ Skipping ${filename} - failed to fetch`)
				continue
			}
			
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
 * Generic push function for a specific sync type
 * @param {string} syncType - Type of sync ('scriptforge' or 'query')
 * @param {boolean} silent - Whether to suppress progress output
 * @returns {Promise<Object>} Results with toUpdate, toCreate, successCount, remoteMap
 */
export async function pushItems(syncType, silent = false) {
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
	
	// Fetch full details for each remote item in parallel (including content)
	if (!silent && remoteItems.length > 1) {
		console.log(`📡 Fetching ${remoteItems.length} ${config.displayName} details in parallel...`)
	}
	
	const remoteMap = new Map()
	
	if (remoteItems.length > 0) {
		const fetchPromises = remoteItems.map(item =>
			fetchItemById(syncType, item.id, true)
				.then(fullItem => ({ fullItem, success: true }))
				.catch(error => ({ item, error, success: false }))
		)
		
		const results = await Promise.all(fetchPromises)
		
		for (const result of results) {
			if (result.success) {
				const { fullItem } = result
				remoteMap.set(fullItem.name, {
					id: fullItem.id,
					content: fullItem[config.contentField] || '',
					app_id: fullItem.app_id
				})
			} else {
				console.error(`⚠️  Failed to fetch ${result.item.name}: ${result.error.message}`)
			}
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
 * Get all files from sync directories for clearing
 * @returns {Array} Array of file objects with dir, file, and type
 */
export function getAllSyncFiles() {
	const allFiles = []
	
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
	
	return allFiles
}

/**
 * Delete a file from a sync directory
 * @param {string} dir - Directory path
 * @param {string} file - Filename
 */
export function deleteSyncFile(dir, file) {
	const filepath = join(dir, file)
	rmSync(filepath)
}
