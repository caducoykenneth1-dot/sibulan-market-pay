"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Eye } from "lucide-react";
import { type UnpaidStall } from "./UnpaidDues";
import { format } from "date-fns";

// Desktop columns with full information
export const columns = (
  onView: (invoice: UnpaidStall) => void
): ColumnDef<UnpaidStall>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
        aria-label="Select all"
        className="translate-y-[2px] h-4 w-4 accent-primary cursor-pointer"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(!!e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
        className="translate-y-[2px] h-4 w-4 accent-primary cursor-pointer"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "vendor_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="hover:bg-muted"
      >
        Vendor
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("vendor_name")}</div>
    ),
  },
  {
    accessorKey: "stall_name",
    header: "Stall",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate" title={row.getValue("stall_name")}>
        {row.getValue("stall_name")}
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="hover:bg-muted ml-auto"
      >
        Amount
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(amount);
      return <div className="text-right font-semibold text-destructive">{formatted}</div>;
    },
  },
  {
    accessorKey: "due_date",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="hover:bg-muted"
      >
        Due Date
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const dueDate = new Date(row.getValue("due_date"));
      const isOverdue = dueDate < new Date() && !dueDate.toDateString().includes(new Date().toDateString());
      
      return (
        <div className="flex items-center gap-2">
          <span className={isOverdue ? "text-destructive font-medium" : ""}>
            {format(dueDate, "MMM dd, yyyy")}
          </span>
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">
              Overdue
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      return (
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={(e) => {
            e.stopPropagation();
            onView(row.original);
          }}
          className="hover:bg-muted"
          aria-label={`View invoice for ${row.original.vendor_name}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      );
    },
  },
];

// Mobile-optimized columns with condensed information
export const createMobileColumns = (
  onView: (invoice: UnpaidStall) => void,
  isOverdue: (date: string) => boolean
): ColumnDef<UnpaidStall>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
        aria-label="Select all"
        className="h-5 w-5 accent-primary cursor-pointer"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(!!e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${row.original.vendor_name}`}
        className="h-5 w-5 accent-primary cursor-pointer"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    id: "info",
    header: "Invoice Details",
    cell: ({ row }) => {
      const dueDate = new Date(row.original.due_date);
      const overdue = isOverdue(row.original.due_date);
      
      return (
        <div className="space-y-1 py-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm truncate">{row.original.vendor_name}</div>
            {overdue && (
              <Badge variant="destructive" className="text-xs flex-shrink-0">
                Overdue
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {row.original.stall_name}
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              {format(dueDate, "MMM dd, yyyy")}
            </div>
            <div className="text-base font-bold text-destructive">
              ₱{row.original.amount.toLocaleString()}
            </div>
          </div>
        </div>
      );
    },
  },
];