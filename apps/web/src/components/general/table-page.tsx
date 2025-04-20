import Link from "next/link";
import { PlusCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

export type ListFieldDataType = string | number | boolean | null | undefined | JSX.Element;

export interface FieldInfo<T extends Record<string, any>> {
  name: string;
  data: (item: T) => ListFieldDataType;
}

interface TablePageProps<T extends Record<string, any>> {
  title: string;
  addButton?: {
    text: string;
    url: string;
  };
  data: T[];
  columnMapping: FieldInfo<T>[];
  caption?: string;
  onClick?: (item: T) => void;
  buttons?: React.ReactNode;
}

export default function TablePage<T extends Record<string, any>>({
  title,
  addButton,
  data,
  columnMapping,
  caption,
  onClick,
  buttons,
}: TablePageProps<T>) {
  const columnKeys = useMemo(
    () => columnMapping.map((field) => field.name),
    [columnMapping],
  );

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex items-center">
          {buttons ? (
            buttons
          ) : addButton ? (
            <Link href={addButton.url}>
              <Button className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                {addButton.text}
              </Button>
            </Link>
          ) : (
            <></>
          )}
        </div>
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
            <TableRow
              key={index}
              onClick={() => onClick && onClick(item)}
              className="cursor-pointer hover:bg-gray-100"
            >
              {columnMapping.map((field) => (
                <TableCell
                  key={`${index}-${field.name}`}
                  className={field.name === columnKeys[0] ? "font-medium" : ""}
                >
                  {field.data(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
