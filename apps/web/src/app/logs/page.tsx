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
import { fetchLogs, getAvailableLogDates } from "@/app/actions/logs"
import { toastNullError } from "@/lib/utils"
import { toast } from "sonner"
import { Level, LogJSON, Source, ALL_LEVELS, LEVEL_NAMES } from "@/lib/types"

const LEVEL_COLORS: Record<Level, string> = {
  trace: "bg-slate-500",
  debug: "bg-emerald-500",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  fatal: "bg-rose-600",
}

export default function LogsPage() {
  /* --------------------------------- filters -------------------------------- */
  const [levels, setLevels] = useState<Level[]>(["info", "warn", "error", "fatal"])
  const [sources, setSources] = useState<Source[]>(["backend", "frontend"])
  const [query, setQuery] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [pretty, setPretty] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [availableDates, setAvailableDates] = useState<string[]>([])

  /* ----------------------------------- data ---------------------------------- */
  const [logs, setLogs] = useState<LogJSON[]>([])
  const [rawLogs, setRawLogs] = useState<string>("")
  const [selectedLog, setSelectedLog] = useState<LogJSON | null>(null)

  const [panelHeight, setPanelHeight] = useState(240) // px
  const dragStartYRef = useRef<number>(0)
  const startHeightRef = useRef<number>(0)

  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadDates = async () => {
      try {
        const result = await getAvailableLogDates()
        const dates = toastNullError({ result, shortMessage: "Failed to load log dates" })
        if (!dates) return
        setAvailableDates(dates)
        if (!dates.includes(selectedDate)) {
          setSelectedDate(dates[0]!)
        }
      } catch (error) {
        toastNullError({ error, shortMessage: "Failed to load log dates" })
      }
    }

    loadDates()
  }, [selectedDate])

  const loadLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      setLogs([])
      setRawLogs("")

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

      const data = toastNullError({ result, shortMessage: "Failed to load logs" })
      if (!data) return

      if (typeof data === "string") {
        setRawLogs(data)
      } else {
        setLogs(data)
      }
    } catch (error) {
      toastNullError({ error, shortMessage: "Failed to load logs" })
    } finally {
      setIsLoading(false)
    }
  }, [levels, sources, query, fromDate, toDate, selectedDate, pretty])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(loadLogs, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, loadLogs])

  useEffect(() => {
    if (logEndRef.current && !pretty) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, pretty])

  const startDrag = useCallback((e: React.MouseEvent) => {
    dragStartYRef.current = e.clientY
    startHeightRef.current = panelHeight

    const onDrag = (ev: MouseEvent) => {
      const delta = dragStartYRef.current - ev.clientY
      setPanelHeight(prev => {
        const newHeight = Math.min(Math.max(startHeightRef.current + delta, 120), 600)
        return newHeight
      })
    }

    const stopDrag = () => {
      window.removeEventListener("mousemove", onDrag)
      window.removeEventListener("mouseup", stopDrag)
    }

    window.addEventListener("mousemove", onDrag)
    window.addEventListener("mouseup", stopDrag)
  }, [panelHeight])

  const toggleLevel = useCallback((level: Level) => {
    setLevels(prev => (prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]))
  }, [])

  const toggleSource = useCallback((src: Source) => {
    setSources(prev => (prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]))
  }, [])

  const copyToClipboard = useCallback(() => {
    const content = pretty ? rawLogs : JSON.stringify(logs, null, 2)
    navigator.clipboard
      .writeText(content)
      .then(() => toast.info("Logs copied to clipboard"))
      .catch(error => toastNullError({ error, shortMessage: "Failed to copy logs" }))
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedLog(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
            {/* levels */}
            <div className="space-y-2">
              <Label>Log Levels</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_LEVELS.map(level => (
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

            <div className="space-y-2">
              <Label>Sources</Label>
              <div className="flex flex-col space-y-2">
                {["backend", "frontend"].map(src => (
                  <div key={src} className="flex items-center space-x-2">
                    <Checkbox
                      id={`source-${src}`}
                      checked={sources.includes(src as Source)}
                      onCheckedChange={() => toggleSource(src as Source)}
                    />
                    <Label htmlFor={`source-${src}`}>{src}</Label>
                  </div>
                ))}
              </div>
            </div>

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
                    onChange={e => setFromDate(e.target.value)}
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
                    onChange={e => setToDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                type="search"
                placeholder="Search logs..."
                value={query}
                onChange={e => setQuery(e.target.value)}
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
                      availableDates.map(date => (
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

      <Card className="relative h-[calc(100vh-24rem)]">
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
        <CardContent className="p-0 h-[calc(100%-3.5rem)]">
          <Tabs defaultValue="formatted" className="h-full">
            <div className="border-b px-4">
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="formatted" className="h-[calc(100%-40px)] m-0">
              <div
                className="h-full overflow-auto bg-muted/20 font-mono text-sm p-4"
                style={{ paddingBottom: selectedLog ? panelHeight + 16 : 0 }}
              >
                {logs.length === 0 && !pretty ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {isLoading ? "Loading logs..." : "No logs found matching your criteria"}
                  </div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={`${log.time}-${idx}`}
                      className="mb-1 flex items-start gap-2 hover:bg-muted/50 cursor-pointer rounded px-1"
                      onClick={() => setSelectedLog(log)}
                    >
                      <span className="text-muted-foreground">
                        {new Date(log.time).toLocaleString()}
                      </span>
                      <Badge className={LEVEL_COLORS[LEVEL_NAMES[log.level]!]}>
                        {LEVEL_NAMES[log.level]!.toUpperCase()}
                      </Badge>
                      <span className="text-muted-foreground">[{log.src || "backend"}]</span>
                      <span>{log.msg || JSON.stringify(log)}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </TabsContent>

            <TabsContent value="raw" className="h-[calc(100%-40px)] m-0">
              <pre className="h-full overflow-auto bg-muted/20 p-4 text-sm whitespace-pre-wrap">
                {pretty ? rawLogs : JSON.stringify(logs, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>

        {selectedLog && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-background border-t shadow-lg"
            style={{ height: panelHeight }}
          >
            <div
              className="h-2 w-full cursor-row-resize bg-muted"
              onMouseDown={startDrag}
            />
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium">Log Details</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
            <pre className="h-[calc(100%-3rem)] overflow-auto p-4 text-xs whitespace-pre-wrap">
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  )
}

