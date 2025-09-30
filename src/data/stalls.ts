export type StallStatus = "current" | "due" | "overdue" | "vacant";

export type StallRecord = {
  id: string;
  name: string;
  vendor: string;
  contact: string;
  type: string;
  monthlyRent: number;
  lastPayment: string;
  nextDue: string;
  status: StallStatus;
  occupied: boolean;
};

export const BASE_TYPE_OPTIONS: string[] = [
  "Fish",
  "Meat",
  "Vegetables",
  "Fruits",
  "Dry Goods",
  "General",
  "Frozen Goods",
  "Poultry",
  "Spices"
];

const BASE_STALLS: StallRecord[] = [
  {
    id: "stall-1",
    name: "Stall 1",
    vendor: "Xtian Daron",
    contact: "09123456789",
    type: "Vegetables",
    monthlyRent: 500,
    lastPayment: "2024-01-15",
    nextDue: "2024-02-15",
    status: "current",
    occupied: true
  },
  {
    id: "stall-2",
    name: "Stall 2",
    vendor: "Cristian Dev",
    contact: "09987654321",
    type: "Meat",
    monthlyRent: 750,
    lastPayment: "2024-01-10",
    nextDue: "2024-02-10",
    status: "due",
    occupied: true
  },
  {
    id: "stall-3",
    name: "Stall 3",
    vendor: "Ana Reyes",
    contact: "09555666777",
    type: "Fish",
    monthlyRent: 600,
    lastPayment: "2023-12-20",
    nextDue: "2024-01-20",
    status: "overdue",
    occupied: true
  },
  {
    id: "stall-4",
    name: "Stall 4",
    vendor: "Cristian Daron",
    contact: "09112223333",
    type: "Fruits",
    monthlyRent: 550,
    lastPayment: "2024-01-25",
    nextDue: "2024-02-25",
    status: "current",
    occupied: true
  },
  {
    id: "stall-5",
    name: "Stall 5",
    vendor: "",
    contact: "",
    type: "General",
    monthlyRent: 400,
    lastPayment: "",
    nextDue: "",
    status: "vacant",
    occupied: false
  },
  {
    id: "stall-6",
    name: "Stall 6",
    vendor: "Rosa Silva",
    contact: "09444333222",
    type: "Dry Goods",
    monthlyRent: 450,
    lastPayment: "2024-01-18",
    nextDue: "2024-02-18",
    status: "current",
    occupied: true
  }
];

export const createInitialStalls = (): StallRecord[] => BASE_STALLS.map((stall) => ({ ...stall }));

export const formatStallDisplay = (stall: StallRecord): string => {
  const vendor = stall.vendor ? ` - ${stall.vendor}` : "";
  return `${stall.name}${vendor}`;
};

export const getNextStallNumbers = (stalls: StallRecord[]) => {
  const nextIdNumber =
    stalls.reduce((highest, stall) => {
      const match = /stall-(\d+)/.exec(stall.id);
      if (!match) {
        return highest;
      }
      return Math.max(highest, Number(match[1]));
    }, 0) + 1;

  const nextNameNumber =
    stalls.reduce((highest, stall) => {
      const match = /Stall\s+(\d+)/i.exec(stall.name);
      if (!match) {
        return highest;
      }
      return Math.max(highest, Number(match[1]));
    }, 0) + 1;

  return { nextIdNumber, nextNameNumber };
};
