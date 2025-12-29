/**
 * Diff display utilities for sync operations
 */

import { createTwoFilesPatch } from 'diff'

/**
 * Colorizes diff output for better readability
 * @param {string} line - A line from the diff output
 * @returns {string} Colorized line
 */
export function colorizeDiffLine(line) {
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
export function displayDiff(filename, oldContent, newContent, oldLabel = 'Remote', newLabel = 'Local') {
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
export async function showPullDiffs(itemsWithDiffs, showDiffs = false) {
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
export async function showPushDiffs(filesToUpdate, remoteMap, showDiffs = false) {
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
 * Display env var diffs in a readable format
 * @param {Array} diffs - Array of diff objects
 * @param {string} direction - 'pull' or 'push'
 */
export function displayEnvDiffs(diffs, direction = 'pull') {
	if (diffs.length === 0) {
		console.log('  No differences found.')
		return
	}
	
	console.log(`\n${'═'.repeat(70)}`)
	console.log(`📄 cx.env`)
	console.log('─'.repeat(70))
	
	for (const diff of diffs) {
		if (diff.type === 'add') {
			console.log(`\x1b[32m+ ${diff.key}=${diff.remoteVal}\x1b[0m`)
		} else if (diff.type === 'remove') {
			console.log(`\x1b[31m- ${diff.key}=${diff.localVal}\x1b[0m`)
		} else if (diff.type === 'change') {
			console.log(`\x1b[31m- ${diff.key}=${diff.localVal}\x1b[0m`)
			console.log(`\x1b[32m+ ${diff.key}=${diff.remoteVal}\x1b[0m`)
		}
	}
	
	console.log('═'.repeat(70))
}

/**
 * Display push diffs for env vars
 * @param {Object} changes - Object with toCreate, toUpdate, toDelete
 * @param {Object} remoteEnv - Current remote values
 */
export function displayEnvPushDiffs(changes, remoteEnv) {
	const { toCreate, toUpdate, toDelete } = changes
	const totalDiffs = toCreate.length + toUpdate.length + toDelete.length
	
	if (totalDiffs === 0) {
		console.log('  No differences found.')
		return
	}
	
	console.log(`\n${'═'.repeat(70)}`)
	console.log('📄 cx.env (Local → Remote)')
	console.log('─'.repeat(70))
	
	for (const item of toCreate) {
		console.log(`\x1b[32m+ ${item.key}=${item.value}\x1b[0m`)
	}
	
	for (const item of toUpdate) {
		console.log(`\x1b[31m- ${item.key}=${remoteEnv[item.key]}\x1b[0m`)
		console.log(`\x1b[32m+ ${item.key}=${item.value}\x1b[0m`)
	}
	
	for (const item of toDelete) {
		console.log(`\x1b[31m- ${item.key}=${remoteEnv[item.key]}\x1b[0m`)
	}
	
	console.log('═'.repeat(70))
}
