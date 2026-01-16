import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SCRIPTFORGE_API_README = 'https://cdn.cnxcdn.com/scriptforge-api-docs/api/README.md'
const SCRIPTFORGE_API_BASE = 'https://cdn.cnxcdn.com/scriptforge-api-docs/api/'

export async function aiInstructionsAction(options) {
	const silent = options.silent || options.raw

	try {
		// Get the current working directory (where the command is run)
		const targetDir = process.cwd()
		const githubDir = join(targetDir, '.github')
		
		// Get the source directory from the package
		const sourceDir = join(__dirname, '..', 'ai-instructions')
		
		if (!existsSync(sourceDir)) {
			console.error('Error: ai-instructions directory not found in package')
			process.exit(1)
		}

		// Create .github directory if it doesn't exist
		if (!existsSync(githubDir)) {
			mkdirSync(githubDir, { recursive: true })
			if (!silent) console.log('✓ Created .github directory')
		}

		// Copy all instruction files
		const files = readdirSync(sourceDir).filter(f => f.endsWith('.md'))
		let copiedCount = 0

		for (const file of files) {
			const sourcePath = join(sourceDir, file)
			const targetPath = join(githubDir, file)
			
			const content = readFileSync(sourcePath, 'utf-8')
			writeFileSync(targetPath, content, 'utf-8')
			
			if (!silent) console.log(`✓ Copied ${file} to .github/`)
			copiedCount++
		}

		// Update .gitignore
		updateIgnoreFile(targetDir, '.gitignore', silent)
		
		// Update .npmignore if it exists
		const npmignorePath = join(targetDir, '.npmignore')
		if (existsSync(npmignorePath)) {
			updateIgnoreFile(targetDir, '.npmignore', silent)
		}

		// Download ScriptForge API documentation
		if (!silent) console.log('\n📥 Downloading ScriptForge API documentation...')
		const apiDocsCount = await downloadScriptForgeAPIDocs(githubDir, silent)

		if (!silent) {
			console.log(`\n✓ Successfully copied ${copiedCount} instruction file(s) to .github/`)
			console.log(`✓ Downloaded ${apiDocsCount} ScriptForge API documentation file(s)`)
			console.log('✓ Updated ignore files')
			console.log('\nThe AI instructions are now available in your .github/ directory.')
			console.log('GitHub Copilot will automatically use these instructions for this project.')
		}

	} catch (error) {
		console.error('Error copying AI instructions:', error.message)
		process.exit(1)
	}
}

async function downloadScriptForgeAPIDocs(githubDir, silent) {
	let downloadedCount = 0

	try {
		// Download the main README
		const readmeContent = await fetchURL(SCRIPTFORGE_API_README)
		const readmePath = join(githubDir, 'scriptforge-api-README.md')
		writeFileSync(readmePath, readmeContent, 'utf-8')
		if (!silent) console.log('✓ Downloaded scriptforge-api-README.md')
		downloadedCount++

		// Extract markdown links from the API Reference section
		const links = extractMarkdownLinks(readmeContent)
		
		// Download each linked file
		for (const link of links) {
			try {
				const url = SCRIPTFORGE_API_BASE + link
				const content = await fetchURL(url)
				const filename = 'scriptforge-api-' + basename(link)
				const filepath = join(githubDir, filename)
				writeFileSync(filepath, content, 'utf-8')
				if (!silent) console.log(`✓ Downloaded ${filename}`)
				downloadedCount++
			} catch (error) {
				if (!silent) console.log(`⚠ Failed to download ${link}: ${error.message}`)
			}
		}
	} catch (error) {
		if (!silent) console.log(`⚠ Failed to download ScriptForge API docs: ${error.message}`)
	}

	return downloadedCount
}

async function fetchURL(url) {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`)
	}
	return await response.text()
}

function extractMarkdownLinks(content) {
	// Find the API Reference section and extract links
	const apiRefMatch = content.match(/## API Reference\s+([\s\S]*?)(?=\n##|\n---|\n\*Generated|$)/i)
	if (!apiRefMatch) return []

	const apiSection = apiRefMatch[1]
	
	// Extract markdown links like [text](./file.md)
	const linkRegex = /\[([^\]]+)\]\(\.\/([^)]+\.md)\)/g
	const links = []
	let match

	while ((match = linkRegex.exec(apiSection)) !== null) {
		links.push(match[2]) // Get the filename part
	}

	return links
}

function updateIgnoreFile(targetDir, filename, silent) {
	const filepath = join(targetDir, filename)
	let content = ''
	
	if (existsSync(filepath)) {
		content = readFileSync(filepath, 'utf-8')
	}

	// Check if the rule already exists
	const rules = [
		'.github/*.instructions.md',
		'.github/scriptforge-api-*.md'
	]

	let updated = false
	for (const rule of rules) {
		if (!content.includes(rule)) {
			// Add a section header if the file is not empty and doesn't end with newline
			if (content && !content.endsWith('\n')) {
				content += '\n'
			}
			
			// Add comment header if this is the first AI instruction rule
			if (!content.includes('# AI Instructions')) {
				content += '\n# AI Instructions\n'
			}
			
			content += rule + '\n'
			updated = true
		}
	}

	if (updated) {
		writeFileSync(filepath, content, 'utf-8')
		if (!silent) console.log(`✓ Updated ${filename}`)
	} else {
		if (!silent) console.log(`✓ ${filename} already contains required rules`)
	}
}
