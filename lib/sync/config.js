/**
 * Config sync module - handles syncing configuration sections to/from cx.toml
 * Provides a reusable pattern for pulling/pushing config sections from various endpoints
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import * as TOML from '@iarna/toml'
import { makeAuthenticatedRequest } from '../utils.js'
import { CONFIG_FILE } from './constants.js'

/**
 * Configuration for different config sections that can be synced
 * Each section maps to a remote endpoint and has transformation functions
 */
export const CONFIG_SECTIONS = {
	domain: {
		key: 'domain',
		endpoint: 'dev/domain',
		displayName: 'Domain',
		displayNamePlural: 'Domains',
		icon: '🌐',
		/**
		 * Transform remote data to TOML format
		 * @param {Object} remoteData - Data from the API
		 * @returns {Object} Data to store in TOML
		 */
		toToml: (remoteData) => ({
			domain: remoteData.domain || '',
			framework_version: remoteData.framework_version || 'latest'
		}),
		/**
		 * Transform TOML data to remote format
		 * @param {Object} tomlData - Data from TOML file
		 * @returns {Object} Data to send to API
		 */
		fromToml: (tomlData) => ({
			domain: tomlData.domain || '',
			framework_version: tomlData.framework_version || 'latest'
		}),
		/**
		 * Get unique identifier for a record
		 * @param {Object} data - Record data
		 * @returns {string} Unique identifier
		 */
		getId: (data) => data.domain,
		/**
		 * Compare two records for equality
		 * @param {Object} local - Local record
		 * @param {Object} remote - Remote record
		 * @returns {boolean} True if records are equal
		 */
		isEqual: (local, remote) => {
			return local.domain === remote.domain && 
				   local.framework_version === remote.framework_version
		}
	}
	// Future config sections can be added here following the same pattern
	// Example:
	// settings: {
	//     key: 'settings',
	//     endpoint: 'dev/settings',
	//     ...
	// }
}

/**
 * Read the entire cx.toml config file
 * @returns {Object} Parsed TOML config or empty object if file doesn't exist
 */
export function readConfigFile() {
	if (!existsSync(CONFIG_FILE)) {
		return {}
	}
	try {
		const content = readFileSync(CONFIG_FILE, 'utf-8')
		return TOML.parse(content)
	} catch (error) {
		throw new Error(`Failed to parse ${CONFIG_FILE}: ${error.message}`)
	}
}

/**
 * Write the entire cx.toml config file
 * Preserves existing sections that aren't being updated
 * @param {Object} config - Full config object to write
 */
export function writeConfigFile(config) {
	const content = TOML.stringify(config)
	writeFileSync(CONFIG_FILE, content, 'utf-8')
}

/**
 * Read a specific section from cx.toml
 * @param {string} sectionKey - The section key (e.g., 'domain')
 * @returns {Array|Object|null} Section data or null if not found
 */
export function readConfigSection(sectionKey) {
	const config = readConfigFile()
	return config[sectionKey] || null
}

/**
 * Write a specific section to cx.toml, preserving other sections
 * @param {string} sectionKey - The section key (e.g., 'domain')
 * @param {Array|Object} data - Data to write to the section
 */
export function writeConfigSection(sectionKey, data) {
	const config = readConfigFile()
	config[sectionKey] = data
	writeConfigFile(config)
}

/**
 * Fetch remote config data for a section
 * @param {string} sectionType - Section type from CONFIG_SECTIONS
 * @param {boolean} silent - Whether to suppress output
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export async function fetchRemoteConfig(sectionType, silent = false) {
	const config = CONFIG_SECTIONS[sectionType]
	if (!config) {
		return { success: false, error: `Unknown config section: ${sectionType}` }
	}

	const appId = process.env.APP_ID
	if (!appId) {
		return { success: false, error: 'No APP_ID configured. Run "cx configure:app" first.' }
	}

	const endpoint = `${config.endpoint}?app_id=${appId}`
	const result = await makeAuthenticatedRequest(endpoint, 'GET', null, silent)

	if (!result.success) {
		return { success: false, error: result.error }
	}

	// Ensure we return an array
	const data = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean)
	
	return { success: true, data, rawData: result.data }
}

/**
 * Pull config from remote and write to cx.toml
 * @param {string} sectionType - Section type from CONFIG_SECTIONS
 * @param {boolean} silent - Whether to suppress output
 * @param {boolean} previewOnly - If true, only analyze without writing
 * @returns {Promise<{success: boolean, data?: Array, diffs?: Array, error?: string}>}
 */
export async function pullConfigSection(sectionType, silent = false, previewOnly = false) {
	const sectionConfig = CONFIG_SECTIONS[sectionType]
	if (!sectionConfig) {
		return { success: false, error: `Unknown config section: ${sectionType}` }
	}

	// Fetch remote data
	const remoteResult = await fetchRemoteConfig(sectionType, silent)
	if (!remoteResult.success) {
		return remoteResult
	}

	// Transform remote data to TOML format
	const remoteData = remoteResult.data.map(item => sectionConfig.toToml(item))
	
	// Read local data
	const localData = readConfigSection(sectionConfig.key) || []
	const localArray = Array.isArray(localData) ? localData : [localData].filter(d => Object.keys(d).length > 0)

	// Calculate diffs
	const diffs = calculateConfigDiffs(localArray, remoteData, sectionConfig)

	if (previewOnly) {
		return {
			success: true,
			data: remoteData,
			localData: localArray,
			diffs,
			total: remoteData.length
		}
	}

	// Write to config file
	writeConfigSection(sectionConfig.key, remoteData)

	return {
		success: true,
		data: remoteData,
		diffs,
		total: remoteData.length,
		pulled: remoteData.length
	}
}

/**
 * Push config from cx.toml to remote
 * @param {string} sectionType - Section type from CONFIG_SECTIONS
 * @param {boolean} silent - Whether to suppress output
 * @param {boolean} previewOnly - If true, only analyze without pushing
 * @returns {Promise<{success: boolean, toCreate?: Array, toUpdate?: Array, toDelete?: Array, error?: string}>}
 */
export async function pushConfigSection(sectionType, silent = false, previewOnly = false) {
	const sectionConfig = CONFIG_SECTIONS[sectionType]
	if (!sectionConfig) {
		return { success: false, error: `Unknown config section: ${sectionType}` }
	}

	// Read local data
	const localData = readConfigSection(sectionConfig.key) || []
	const localArray = Array.isArray(localData) ? localData : [localData].filter(d => Object.keys(d).length > 0)

	if (localArray.length === 0) {
		return {
			success: true,
			toCreate: [],
			toUpdate: [],
			toDelete: [],
			total: 0
		}
	}

	// Fetch remote data
	const remoteResult = await fetchRemoteConfig(sectionType, silent)
	if (!remoteResult.success) {
		return remoteResult
	}

	const remoteData = remoteResult.data.map(item => sectionConfig.toToml(item))
	const remoteRaw = remoteResult.data

	// Calculate what needs to be created/updated/deleted
	const toCreate = []
	const toUpdate = []
	const toDelete = []

	// Build remote lookup by ID
	const remoteById = new Map()
	for (let i = 0; i < remoteData.length; i++) {
		const id = sectionConfig.getId(remoteData[i])
		remoteById.set(id, { toml: remoteData[i], raw: remoteRaw[i] })
	}

	// Check local items
	for (const localItem of localArray) {
		const id = sectionConfig.getId(localItem)
		const remote = remoteById.get(id)

		if (!remote) {
			// New item to create
			toCreate.push({
				id,
				local: localItem,
				payload: sectionConfig.fromToml(localItem)
			})
		} else if (!sectionConfig.isEqual(localItem, remote.toml)) {
			// Item needs update
			toUpdate.push({
				id,
				local: localItem,
				remote: remote.toml,
				remoteRaw: remote.raw,
				payload: sectionConfig.fromToml(localItem)
			})
		}
		remoteById.delete(id)
	}

	// Remaining remote items are to be deleted (if we want to support deletion)
	// For now, we don't delete remote items that aren't in local config
	// Uncomment below if deletion is desired:
	// for (const [id, remote] of remoteById) {
	//     toDelete.push({ id, remote: remote.toml, remoteRaw: remote.raw })
	// }

	if (previewOnly) {
		return {
			success: true,
			toCreate,
			toUpdate,
			toDelete,
			localData: localArray,
			remoteData,
			total: localArray.length
		}
	}

	// Execute push operations
	const appId = process.env.APP_ID
	let successCount = 0
	let failCount = 0
	const errors = []

	// Process creates
	for (const item of toCreate) {
		const body = { ...item.payload, app_id: appId }
		const result = await makeAuthenticatedRequest(sectionConfig.endpoint, 'POST', body, silent)
		
		if (result.success) {
			successCount++
			if (!silent) {
				console.log(`✅ Created ${sectionConfig.displayName}: ${item.id}`)
			}
		} else {
			failCount++
			errors.push({ id: item.id, error: result.error })
			if (!silent) {
				console.error(`❌ Failed to create ${sectionConfig.displayName} ${item.id}: ${result.error}`)
			}
		}
	}

	// Process updates
	for (const item of toUpdate) {
		const body = { ...item.payload, app_id: appId }
		// For domain, we PUT to the base endpoint since domain is the identifier
		const endpoint = sectionConfig.endpoint
		const result = await makeAuthenticatedRequest(endpoint, 'PUT', body, silent)
		
		if (result.success) {
			successCount++
			if (!silent) {
				console.log(`✅ Updated ${sectionConfig.displayName}: ${item.id}`)
			}
		} else {
			failCount++
			errors.push({ id: item.id, error: result.error })
			if (!silent) {
				console.error(`❌ Failed to update ${sectionConfig.displayName} ${item.id}: ${result.error}`)
			}
		}
	}

	return {
		success: failCount === 0,
		toCreate,
		toUpdate,
		toDelete,
		successCount,
		failCount,
		errors
	}
}

/**
 * Calculate differences between local and remote config
 * @param {Array} localData - Local config data
 * @param {Array} remoteData - Remote config data
 * @param {Object} sectionConfig - Section configuration
 * @returns {Array} Array of diff objects
 */
export function calculateConfigDiffs(localData, remoteData, sectionConfig) {
	const diffs = []

	// Build local lookup by ID
	const localById = new Map()
	for (const item of localData) {
		const id = sectionConfig.getId(item)
		localById.set(id, item)
	}

	// Check remote items
	for (const remoteItem of remoteData) {
		const id = sectionConfig.getId(remoteItem)
		const localItem = localById.get(id)

		if (!localItem) {
			diffs.push({
				type: 'add',
				id,
				remote: remoteItem
			})
		} else if (!sectionConfig.isEqual(localItem, remoteItem)) {
			diffs.push({
				type: 'change',
				id,
				local: localItem,
				remote: remoteItem
			})
		}
		localById.delete(id)
	}

	// Remaining local items would be removed
	for (const [id, localItem] of localById) {
		diffs.push({
			type: 'remove',
			id,
			local: localItem
		})
	}

	return diffs
}

/**
 * Display config diffs in a human-readable format
 * @param {Array} diffs - Array of diff objects
 * @param {Object} sectionConfig - Section configuration
 * @param {string} operation - 'pull' or 'push'
 */
export function displayConfigDiffs(diffs, sectionConfig, operation = 'pull') {
	if (diffs.length === 0) {
		console.log(`  No changes for ${sectionConfig.displayNamePlural}`)
		return
	}

	for (const diff of diffs) {
		switch (diff.type) {
			case 'add':
				console.log(`  ✨ ${operation === 'pull' ? 'New' : 'Create'}: ${diff.id}`)
				for (const [key, value] of Object.entries(diff.remote)) {
					console.log(`     + ${key}: ${value}`)
				}
				break
			case 'change':
				console.log(`  📝 ${operation === 'pull' ? 'Changed' : 'Update'}: ${diff.id}`)
				for (const key of Object.keys(diff.remote)) {
					if (diff.local[key] !== diff.remote[key]) {
						console.log(`     - ${key}: ${diff.local[key]}`)
						console.log(`     + ${key}: ${diff.remote[key]}`)
					}
				}
				break
			case 'remove':
				console.log(`  🗑️  ${operation === 'pull' ? 'Remove' : 'Delete'}: ${diff.id}`)
				for (const [key, value] of Object.entries(diff.local)) {
					console.log(`     - ${key}: ${value}`)
				}
				break
		}
	}
}
