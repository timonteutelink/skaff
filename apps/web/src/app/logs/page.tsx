"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Copy, Download, RefreshCw } from "lucide-react"
import { fetchLogs, getAvailableLogDates, type LogJSON } from "@/app/actions/logs"

type Level = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const LEVEL_COLORS: Record<Level, string> = {
  trace: "bg-slate-500",
  debug: "bg-emerald-500",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  fatal: "bg-rose-600",
}

const LEVEL_MAP: Record<number, Level> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
}

const ALL_LEVELS: Level[] = ["trace", "debug", "info", "warn", "error", "fatal"]

export default function LogsPage() {
  // Filter
  const [levels, setLevels] = useState<Level[]>(["info", "warn", "error", "fatal"])
  const [sources, setSources] = useState<string[]>(["backend", "frontend"])
  const [query, setQuery] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [pretty, setPretty] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [availableDates, setAvailableDates] = useState<string[]>([])

  // Data
  const [logs, setLogs] = useState<LogJSON[]>([])
  const [rawLogs, setRawLogs] = useState<string>("")
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadDates = async () => {
      try {
        const dates = await getAvailableLogDates()
        if ('error' in dates) {
          console.error("Failed to load log dates:", dates.error)
          return
        }
        setAvailableDates(dates.data)

        if (dates.data.length > 0 && !selectedDate) {
          setSelectedDate(dates.data[0]!)
        }
      } catch (error) {
        console.error("Failed to load log dates:", error)
      }
    }

    loadDates()
  }, [selectedDate])

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true)

      const result = await fetchLogs({
        levels,
        src: sources,
        q: query,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate).toISOString() : undefined,
        file: selectedDate,
        pretty,
        limit: 500,
      })

      if ('error' in result) {
        console.error("Error fetching logs:", result.error)
        return
      }

      if (typeof result.data === "string") {
        setRawLogs(result.data)
      } else {
        setLogs(result.data)
      }
    } catch (error) {
      console.error("Error fetching logs:", error)
    } finally {
      setIsLoading(false)
    }
  }, [
    levels,
    sources,
    query,
    fromDate,
    toDate,
    selectedDate,
    pretty,
    setLogs,
    setRawLogs,
    setIsLoading,
  ])

  useEffect(() => {
    loadLogs()

    if (autoRefresh) {
      const interval = setInterval(loadLogs, 5000)
      return () => clearInterval(interval)
    }
  }, [loadLogs, autoRefresh])

  useEffect(() => {
    if (logEndRef.current && !pretty) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, pretty])

  const toggleLevel = useCallback((level: Level) => {
    setLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]))
  }, [])

  const toggleSource = useCallback((source: string) => {
    setSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]))
  }, [])

  const copyToClipboard = useCallback(() => {
    const content = pretty ? rawLogs : JSON.stringify(logs, null, 2)

    navigator.clipboard
      .writeText(content)
      .then(() => alert("Logs copied to clipboard"))
      .catch((err) => console.error("Failed to copy logs:", err))
  }, [logs, rawLogs, pretty])

  const downloadLogs = useCallback(() => {
    const content = pretty ? rawLogs : JSON.stringify(logs, null, 2)

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `logs-${selectedDate}.${pretty ? "txt" : "json"}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [logs, rawLogs, selectedDate, pretty])

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Log Explorer</h1>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={loadLogs} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh logs</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex items-center space-x-2">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto-refresh">Auto-refresh</Label>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Log Levels */}
            <div className="space-y-2">
              <Label>Log Levels</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_LEVELS.map((level) => (
                  <Badge
                    key={level}
                    variant={levels.includes(level) ? "default" : "outline"}
                    className={`cursor-pointer ${levels.includes(level) ? LEVEL_COLORS[level] : ""}`}
                    onClick={() => toggleLevel(level)}
                  >
                    {level.toUpperCase()}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Sources */}
            <div className="space-y-2">
              <Label>Sources</Label>
              <div className="flex flex-col space-y-2">
                {["backend", "frontend"].map((source) => (
                  <div key={source} className="flex items-center space-x-2">
                    <Checkbox
                      id={`source-${source}`}
                      checked={sources.includes(source)}
                      onCheckedChange={() => toggleSource(source)}
                    />
                    <Label htmlFor={`source-${source}`}>{source}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="from-date" className="text-xs">
                    From
                  </Label>
                  <Input
                    id="from-date"
                    type="datetime-local"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="to-date" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="to-date"
                    type="datetime-local"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Search and Display Options */}
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                type="search"
                placeholder="Search logs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                  <Switch id="pretty-print" checked={pretty} onCheckedChange={setPretty} />
                  <Label htmlFor="pretty-print">Pretty Print</Label>
                </div>

                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select date" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.length > 0 ? (
                      availableDates.map((date) => (
                        <SelectItem key={date} value={date}>
                          {date}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={selectedDate}>{selectedDate}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-[calc(100vh-24rem)]">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle>Log Output</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={downloadLogs}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="formatted" className="h-full">
            <div className="border-b px-4">
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="formatted" className="h-[calc(100%-40px)] m-0">
              <div className="h-full overflow-auto bg-muted/20 font-mono text-sm p-4">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {isLoading ? "Loading logs..." : "No logs found matching your criteria"}
                  </div>
                ) : (
                  <>
                    {logs.map((log, index) => (
                      <div key={index} className="mb-1 flex items-start gap-2">
                        <span className="text-muted-foreground">{new Date(log.time).toLocaleString()}</span>
                        <Badge className={LEVEL_COLORS[LEVEL_MAP[log.level]!]}>
                          {LEVEL_MAP[log.level]!.toUpperCase()}
                        </Badge>
                        <span className="text-muted-foreground">[{log.src || "backend"}]</span>
                        <span>{log.msg || JSON.stringify(log)}</span>
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="raw" className="h-[calc(100%-40px)] m-0">
              <pre className="h-full overflow-auto bg-muted/20 p-4 text-sm">
                {pretty ? rawLogs : JSON.stringify(logs, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

