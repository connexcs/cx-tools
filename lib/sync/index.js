/**
 * Sync module action functions
 * Orchestrates pull, push, and clear operations across all sync types
 */

import { confirm, select } from '@inquirer/prompts'
import { handleError } from '../utils.js'
import { SYNC_TYPES, SRC_DIR, QUERY_DIR, TEMPLATE_DIR } from './constants.js'
import { pullItems, pushItems, getAllSyncFiles, deleteSyncFile, getExistingSyncFiles, cleanSyncDirectories } from './files.js'
import { pullEnvVars, pushEnvVars, writeLocalEnvFile, updateLocalEnvKey, removeLocalEnvKey } from './env.js'
import { showPullDiffs, showPushDiffs, displayEnvDiffs, displayEnvPushDiffs } from './diff.js'
import { makeAuthenticatedRequest } from '../utils.js'
import { CONFIG_SECTIONS, pullConfigSection, pushConfigSection, displayConfigDiffs } from './config.js'

// Re-export env helpers
export { writeLocalEnvFile, updateLocalEnvKey, removeLocalEnvKey }

// Re-export config functions for direct use
export { pullConfigSection, pushConfigSection, CONFIG_SECTIONS } from './config.js'

/**
 * Pull command - syncs remote files to local directories
 * @param {Object} options - Command options
 */
export async function pullAction(options) {
	try {
		const silent = options.silent || options.raw || false

		console.log('🔄 Starting pull operation...\n')

		// Check for existing files in sync directories
		const existingFiles = getExistingSyncFiles()
		
		if (existingFiles.length > 0 && !silent) {
			// Group files by type for display
			const filesByType = {}
			for (const file of existingFiles) {
				if (!filesByType[file.syncType]) {
					filesByType[file.syncType] = []
				}
				filesByType[file.syncType].push(file)
			}
			
			console.log('📁 Existing files detected in sync directories:')
			console.log('══════════════════════════════════════════════════')
			
			for (const [syncType, files] of Object.entries(filesByType)) {
				const config = SYNC_TYPES[syncType]
				console.log(`\n${config.icon} ${config.displayNamePlural} (${config.dir}): ${files.length} file(s)`)
				files.slice(0, 5).forEach(f => console.log(`  • ${f.file}`))
				if (files.length > 5) {
					console.log(`  ... and ${files.length - 5} more`)
				}
			}
			
			console.log('\n══════════════════════════════════════════════════')
			
			const cleanChoice = await select({
				message: `Found ${existingFiles.length} existing file(s). Would you like to clean the working directory first?`,
				choices: [
					{ name: 'No, keep existing files (pull will overwrite matching files)', value: 'keep' },
					{ name: 'Yes, delete all sync files before pulling', value: 'clean' },
					{ name: 'Cancel pull operation', value: 'cancel' }
				],
				default: 'keep'
			})
			
			if (cleanChoice === 'cancel') {
				console.log('❌ Pull cancelled.')
				return
			}
			
			if (cleanChoice === 'clean') {
				console.log('\n🧹 Cleaning sync directories...')
				const cleanResult = cleanSyncDirectories(existingFiles)
				
				if (cleanResult.errors.length > 0) {
					console.log(`⚠️  Deleted ${cleanResult.deletedCount} file(s), ${cleanResult.errors.length} error(s)`)
					cleanResult.errors.forEach(e => console.log(`  ❌ ${e.file}: ${e.error}`))
				} else {
					console.log(`✅ Deleted ${cleanResult.deletedCount} file(s)`)
				}
				console.log('')
			}
		}

		// First, do a preview to analyze changes for all sync types
		const results = {}
		for (const syncType of Object.keys(SYNC_TYPES)) {
			results[syncType] = await pullItems(syncType, silent, true)
		}

		// Also preview env vars
		const envResults = await pullEnvVars(silent, true)

		// Preview config sections (domain, etc.)
		const configResults = {}
		for (const sectionType of Object.keys(CONFIG_SECTIONS)) {
			configResults[sectionType] = await pullConfigSection(sectionType, silent, true)
		}

		const totalItems = Object.values(results).reduce((sum, r) => sum + r.total, 0)
		const allItemsWithDiffs = Object.values(results).flatMap(r => r.itemsWithDiffs)
		const totalConfigItems = Object.values(configResults).reduce((sum, r) => r.success ? r.total : 0, 0)
		const configWithDiffs = Object.values(configResults).flatMap(r => r.success ? r.diffs : [])
		// Check if there's any local config data that would be removed
		const hasLocalConfigData = Object.values(configResults).some(r => 
			r.success && r.localData && r.localData.length > 0)

		if (totalItems === 0 && (!envResults.success || envResults.total === 0) && totalConfigItems === 0 && !hasLocalConfigData) {
			console.log('\n📭 No items found to pull.')
			return
		}

		// Show summary
		console.log('\n📥 Files to be pulled:')
		console.log('══════════════════════════════════════════════════')

		for (const [syncType, config] of Object.entries(SYNC_TYPES)) {
			const result = results[syncType]
			if (result.total > 0) {
				console.log(`\n${config.icon} ${config.displayNamePlural}: ${result.total} file(s)`)
				result.items.forEach(item => {
					const filename = `${item.name}${config.extension}`
					const hasLocalDiff = result.itemsWithDiffs.some(d => d.filename === filename)
					console.log(`  • ${filename}${hasLocalDiff ? ' ⚠️  (will overwrite local changes)' : ''}`)
				})
			}
		}

		// Show env summary
		if (envResults.success && envResults.total > 0) {
			console.log(`\n🔐 Environment Variables: ${envResults.total} variable(s)`)
			if (envResults.diffs.length > 0) {
				console.log(`   ⚠️  ${envResults.diffs.length} difference(s) from local`)
			}
		}

		// Show config sections summary (domain, etc.)
		for (const [sectionType, sectionConfig] of Object.entries(CONFIG_SECTIONS)) {
			const result = configResults[sectionType]
			// Show if there are remote items OR local items that will be removed
			const hasLocalData = result.success && result.localData && result.localData.length > 0
			const hasRemoteData = result.success && result.total > 0
			if (hasRemoteData || hasLocalData) {
				if (hasRemoteData) {
					console.log(`\n${sectionConfig.icon} ${sectionConfig.displayNamePlural}: ${result.total} item(s) → cx.toml`)
				} else {
					console.log(`\n${sectionConfig.icon} ${sectionConfig.displayNamePlural}: 0 items (will clear local)`)
				}
				if (result.diffs.length > 0) {
					console.log(`   ⚠️  ${result.diffs.length} difference(s) from local`)
				}
			}
		}

		console.log('\n══════════════════════════════════════════════════')
		
		const syncTypeSummary = Object.entries(results)
			.filter(([, r]) => r.total > 0)
			.map(([type, r]) => `${r.total} ${SYNC_TYPES[type].displayNamePlural}`)
			.join(', ')
		
		console.log(`📊 Total: ${totalItems} file(s) (${syncTypeSummary})`)

		if (allItemsWithDiffs.length > 0) {
			console.log(`⚠️  Warning: ${allItemsWithDiffs.length} file(s) have local changes that will be overwritten`)
		}

		// Ask if user wants to view diffs
		let viewDiffs = false
		const hasDiffs = allItemsWithDiffs.length > 0 || envResults.diffs.length > 0 || configWithDiffs.length > 0
		
		if (hasDiffs && !silent) {
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
				if (envResults.diffs.length > 0) {
					console.log('\n🔐 Environment Variable Changes:')
					displayEnvDiffs(envResults.diffs, 'pull')
				}
				// Show config section diffs
				for (const [sectionType, sectionConfig] of Object.entries(CONFIG_SECTIONS)) {
					const result = configResults[sectionType]
					if (result.success && result.diffs.length > 0) {
						console.log(`\n${sectionConfig.icon} ${sectionConfig.displayName} Changes:`)
						displayConfigDiffs(result.diffs, sectionConfig, 'pull')
					}
				}
			}
		}

		// Build confirmation message
		const configTotal = Object.values(configResults).reduce((sum, r) => r.success ? r.total : 0, 0)
		let confirmMsg = `Pull ${totalItems} file(s)`
		if (envResults.total > 0) confirmMsg += ` and ${envResults.total} env var(s)`
		if (configTotal > 0) confirmMsg += ` and ${configTotal} config item(s)`
		confirmMsg += '?'

		// Confirm operation
		const shouldProceed = await confirm({
			message: confirmMsg,
			default: true
		})

		if (!shouldProceed) {
			console.log('❌ Pull cancelled.')
			return
		}

		// Now perform the actual pull
		console.log('\n📥 Pulling files...\n')
		
		const pullResults = {}
		for (const syncType of Object.keys(SYNC_TYPES)) {
			pullResults[syncType] = await pullItems(syncType, silent, false)
		}

		// Pull env vars
		if (envResults.success && envResults.total > 0) {
			await pullEnvVars(silent, false)
			console.log(`✅ cx.env (${envResults.total} variables)`)
		}

		// Pull config sections (domain, etc.)
		for (const [sectionType, sectionConfig] of Object.entries(CONFIG_SECTIONS)) {
			const result = configResults[sectionType]
			// Pull if there are remote items OR local items that need to be cleared
			const hasLocalData = result.success && result.localData && result.localData.length > 0
			const hasRemoteData = result.success && result.total > 0
			if (hasRemoteData || hasLocalData) {
				await pullConfigSection(sectionType, silent, false)
				if (hasRemoteData) {
					console.log(`✅ cx.toml [${sectionConfig.key}] (${result.total} ${sectionConfig.displayNamePlural.toLowerCase()})`)
				} else {
					console.log(`✅ cx.toml [${sectionConfig.key}] (cleared)`)
				}
			}
		}

		const totalPulled = Object.values(pullResults).reduce((sum, r) => sum + r.pulled, 0)

		console.log(`\n🎉 Successfully pulled ${totalPulled}/${totalItems} file(s)`)
		for (const [syncType, config] of Object.entries(SYNC_TYPES)) {
			const result = pullResults[syncType]
			if (result.total > 0) {
				console.log(`   └─ ${result.pulled}/${result.total} ${config.displayNamePlural} → ${config.dir}`)
			}
		}
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}

/**
 * Clear command - clears all sync directories after confirmation
 * @param {Object} options - Command options
 */
export async function clearAction(options) {
	try {
		const silent = options.silent || options.raw || false

		const allFiles = getAllSyncFiles()

		if (allFiles.length === 0) {
			const dirs = Object.values(SYNC_TYPES).map(c => c.dir).join(' or ')
			console.log(`📁 No files found in ${dirs}`)
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
			try {
				deleteSyncFile(dir, file)
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
 * Push command - syncs local files back to remote
 * @param {Object} options - Command options
 */
export async function pushAction(options) {
	try {
		const silent = options.silent || options.raw || false

		console.log('🔄 Starting push operation...\n')

		// Analyze what needs to be pushed for each sync type
		const results = {}
		for (const syncType of Object.keys(SYNC_TYPES)) {
			results[syncType] = await pushItems(syncType, silent)
		}

		// Also analyze env vars
		const envResults = await pushEnvVars(silent, true)

		// Analyze config sections (domain, etc.)
		const configResults = {}
		for (const sectionType of Object.keys(CONFIG_SECTIONS)) {
			configResults[sectionType] = await pushConfigSection(sectionType, silent, true)
		}

		// Collect all files to update/create
		const allToUpdate = Object.values(results).flatMap(r => r.toUpdate)
		const allToCreate = Object.values(results).flatMap(r => r.toCreate)
		const totalChanges = allToUpdate.length + allToCreate.length
		const envChanges = envResults.success ? (envResults.toCreate.length + envResults.toUpdate.length + envResults.toDelete.length) : 0
		const configChanges = Object.values(configResults).reduce((sum, r) => 
			r.success ? (r.toCreate.length + r.toUpdate.length + r.toDelete.length) : 0, 0)

		if (totalChanges === 0 && envChanges === 0 && configChanges === 0) {
			console.log('\n✨ Everything is up to date! No changes to push.')
			return
		}

		// Show summary
		console.log('\n📤 Changes to be pushed:')
		console.log('══════════════════════════════════════════════════')

		for (const [syncType, config] of Object.entries(SYNC_TYPES)) {
			const result = results[syncType]
			if (result.toUpdate.length > 0 || result.toCreate.length > 0) {
				console.log(`\n${config.icon} ${config.displayNamePlural}:`)
				result.toUpdate.forEach(file => {
					console.log(`  📝 ${file.filename} (update)`)
				})
				result.toCreate.forEach(file => {
					console.log(`  ✨ ${file.filename} (new)`)
				})
			}
		}

		// Show env changes
		if (envChanges > 0) {
			console.log('\n🔐 Environment Variables:')
			envResults.toCreate.forEach(item => console.log(`  ✨ ${item.key} (new)`))
			envResults.toUpdate.forEach(item => console.log(`  📝 ${item.key} (update)`))
			envResults.toDelete.forEach(item => console.log(`  🗑️  ${item.key} (delete)`))
		}

		// Show config section changes (domain, etc.)
		for (const [sectionType, sectionConfig] of Object.entries(CONFIG_SECTIONS)) {
			const result = configResults[sectionType]
			if (result.success && (result.toCreate.length > 0 || result.toUpdate.length > 0)) {
				console.log(`\n${sectionConfig.icon} ${sectionConfig.displayNamePlural} (cx.toml):`)
				result.toCreate.forEach(item => console.log(`  ✨ ${item.id} (new)`))
				result.toUpdate.forEach(item => console.log(`  📝 ${item.id} (update)`))
			}
		}

		console.log('\n══════════════════════════════════════════════════')
		console.log(`📊 Total: ${allToUpdate.length} update(s), ${allToCreate.length} new file(s)`)
		if (envChanges > 0) {
			console.log(`   └─ ${envResults.toCreate.length} new, ${envResults.toUpdate.length} update, ${envResults.toDelete.length} delete env var(s)`)
		}
		if (configChanges > 0) {
			const configCreateCount = Object.values(configResults).reduce((sum, r) => r.success ? r.toCreate.length : 0, 0)
			const configUpdateCount = Object.values(configResults).reduce((sum, r) => r.success ? r.toUpdate.length : 0, 0)
			console.log(`   └─ ${configCreateCount} new, ${configUpdateCount} update config item(s)`)
		}

		// Ask if user wants to view diffs
		if ((allToUpdate.length > 0 || configChanges > 0) && !silent) {
			const diffChoice = await select({
				message: 'Would you like to view diffs before pushing?',
				choices: [
					{ name: 'View diffs before proceeding', value: 'view' },
					{ name: 'Continue without viewing diffs', value: 'skip' },
					{ name: 'Cancel push operation', value: 'cancel' }
				],
				default: 'skip'
			})

			if (diffChoice === 'cancel') {
				console.log('❌ Push cancelled.')
				return
			}

			if (diffChoice === 'view') {
				for (const [syncType] of Object.entries(SYNC_TYPES)) {
					const result = results[syncType]
					if (result.toUpdate.length > 0) {
						await showPushDiffs(result.toUpdate, result.remoteMap, true)
					}
				}
				if (envChanges > 0) {
					console.log('\n🔐 Environment Variable Changes:')
					displayEnvPushDiffs(envResults, envResults.remoteEnv)
				}
				// Show config section diffs for push
				for (const [sectionType, sectionConfig] of Object.entries(CONFIG_SECTIONS)) {
					const result = configResults[sectionType]
					if (result.success && (result.toCreate.length > 0 || result.toUpdate.length > 0)) {
						console.log(`\n${sectionConfig.icon} ${sectionConfig.displayName} Changes:`)
						for (const item of result.toUpdate) {
							console.log(`  📝 Update: ${item.id}`)
							for (const key of Object.keys(item.local)) {
								if (item.local[key] !== item.remote[key]) {
									console.log(`     - ${key}: ${item.remote[key]}`)
									console.log(`     + ${key}: ${item.local[key]}`)
								}
							}
						}
						for (const item of result.toCreate) {
							console.log(`  ✨ Create: ${item.id}`)
							for (const [key, value] of Object.entries(item.local)) {
								console.log(`     + ${key}: ${value}`)
							}
						}
					}
				}
			}
		}

		// Build confirmation message
		let pushConfirmMsg = `Push ${totalChanges} file change(s)`
		if (envChanges > 0) pushConfirmMsg += ` and ${envChanges} env var change(s)`
		if (configChanges > 0) pushConfirmMsg += ` and ${configChanges} config change(s)`
		pushConfirmMsg += '?'

		// Confirm operation
		const shouldProceed = await confirm({
			message: pushConfirmMsg,
			default: true
		})

		if (!shouldProceed) {
			console.log('❌ Push cancelled.')
			return
		}

		// Execute the push
		console.log('\n📤 Pushing changes...\n')

		let successCount = 0
		let failCount = 0

		// Process updates and creates for each sync type
		for (const [syncType, config] of Object.entries(SYNC_TYPES)) {
			const result = results[syncType]
			
			// Updates
			for (const file of result.toUpdate) {
				const body = {
					name: file.name,
					[config.contentField]: file.content,
					app_id: file.app_id
				}

				const updateResult = await makeAuthenticatedRequest(
					`${config.endpoint}/${file.id}`,
					'PUT',
					body,
					true
				)

				if (updateResult.success) {
					console.log(`✅ Updated ${file.filename}`)
					successCount++
				} else {
					console.error(`❌ Failed to update ${file.filename}: ${updateResult.error}`)
					failCount++
				}
			}

			// Creates
			for (const file of result.toCreate) {
				const appId = process.env.APP_ID
				if (!appId) {
					console.error(`❌ Cannot create ${file.filename}: No APP_ID configured`)
					failCount++
					continue
				}

				const body = {
					name: file.name,
					[config.contentField]: file.content,
					app_id: appId
				}

				const createResult = await makeAuthenticatedRequest(
					config.endpoint,
					'POST',
					body,
					true
				)

				if (createResult.success) {
					console.log(`✅ Created ${file.filename}`)
					successCount++
				} else {
					console.error(`❌ Failed to create ${file.filename}: ${createResult.error}`)
					failCount++
				}
			}
		}

		// Push env vars
		if (envChanges > 0) {
			const envPushResult = await pushEnvVars(silent, false)
			if (envPushResult.success) {
				successCount += envPushResult.successCount
			}
		}

		// Push config sections (domain, etc.)
		if (configChanges > 0) {
			for (const sectionType of Object.keys(CONFIG_SECTIONS)) {
				const result = configResults[sectionType]
				if (result.success && (result.toCreate.length > 0 || result.toUpdate.length > 0)) {
					const pushResult = await pushConfigSection(sectionType, silent, false)
					if (pushResult.success) {
						successCount += pushResult.successCount
					} else {
						failCount += pushResult.failCount || 0
					}
				}
			}
		}

		console.log(`\n🎉 Push complete: ${successCount} succeeded, ${failCount} failed`)
	} catch (error) {
		handleError(error.message, options.silent || options.raw)
	}
}
