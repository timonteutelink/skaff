export interface ParsedFile {
  path: string
  status: "added" | "modified" | "deleted"
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export function parseGitDiff(diffText: string): { files: ParsedFile[] } {
  const files: ParsedFile[] = []
  const lines = diffText.split("\n")

  let currentFile: ParsedFile | null = null
  let currentHunk: DiffHunk | null = null

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;

    // File header
    if (line.startsWith("diff --git")) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk)
        currentHunk = null
      }

      if (currentFile) {
        files.push(currentFile)
      }

      // Extract file path
      const match = line.match(/diff --git a\/(.*) b\/(.*)/)
      if (match) {
        const filePath = match[1]!
        currentFile = {
          path: filePath,
          status: "modified", // Default status, will be updated later
          hunks: [],
        }
      }
    }

    // File status
    else if (line.startsWith("new file")) {
      if (currentFile) {
        currentFile.status = "added"
      }
    } else if (line.startsWith("deleted file")) {
      if (currentFile) {
        currentFile.status = "deleted"
      }
    }

    // Hunk header
    else if (line.startsWith("@@")) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk)
      }

      const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
      if (match) {
        currentHunk = {
          oldStart: Number.parseInt(match[1]!),
          oldLines: Number.parseInt(match[2]!),
          newStart: Number.parseInt(match[3]!),
          newLines: Number.parseInt(match[4]!),
          lines: [],
        }
      }
    }

    // Diff content
    else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      currentHunk.lines.push(line)
    }
  }

  // Add the last hunk and file
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk)
  }

  if (currentFile) {
    files.push(currentFile)
  }

  return { files }
}

