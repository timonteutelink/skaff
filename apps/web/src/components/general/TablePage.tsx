import Link from "next/link"
import { PlusCircle } from "lucide-react"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { useMemo } from "react"

export type ListFieldDataType = string | number | boolean | null | undefined

export interface FieldInfo<T extends Record<string, any>> {
	name: string
	data: (item: T) => ListFieldDataType
}

interface TablePageProps<T extends Record<string, any>> {
	title: string
	addButtonText: string
	addButtonUrl: string
	data: T[]
	columnMapping: FieldInfo<T>[]
	caption?: string
}

export default function TablePage<T extends Record<string, any>>({
	title,
	addButtonText,
	addButtonUrl,
	data,
	columnMapping,
	caption,
}: TablePageProps<T>) {
	const columnKeys = useMemo(() => columnMapping.map(field => field.name), [columnMapping])

	return (
		<div className="container mx-auto py-10">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-2xl font-bold">{title}</h1>
				<Link href={addButtonUrl}>
					<Button className="flex items-center gap-2">
						<PlusCircle className="h-4 w-4" />
						{addButtonText}
					</Button>
				</Link>
			</div>

			<Table>
				{caption && <TableCaption>{caption}</TableCaption>}
				<TableHeader>
					<TableRow>
						{columnMapping.map((field) => (
							<TableHead key={field.name}>{field.name}</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((item, index) => (
						<TableRow key={index}>
							{columnMapping.map((field) => (
								<TableCell key={`${index}-${field.name}`} className={field.name === columnKeys[0] ? "font-medium" : ""}>
									{field.data(item)}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}


