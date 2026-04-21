

export interface ItemGradeAttriRow {
    grade: string,
    hp: [number, number],
    mp: [number, number],
    patk: [number, number],
    pdef: [number, number],
    matk: [number, number],
    mdef: [number, number],
    sense: [number, number],
    luck: [number, number],
    dodge: [number, number],
    tenacity: [number, number],
}

export const ITEM_GRADE_ATTRI_TABLE = [
    { grade: "下品", hp: [50, 100], mp: [5, 10], patk: [5, 10], pdef: [5, 10], matk: [5, 10], mdef: [5, 10], 
        sense: [5, 10], luck: [5, 10], dodge: [5, 10], tenacity: [5, 10] },
    { grade: "中品", hp: [100, 200], mp: [10, 20], patk: [10, 20], pdef: [10, 20], matk: [10, 20], mdef: [10, 20],
        sense: [10, 20], luck: [10, 20], dodge: [10, 20], tenacity: [10, 20] },
    { grade: "上品", hp: [200, 300], mp: [20, 30], patk: [20, 30], pdef: [20, 30], matk: [20, 30], mdef: [20, 30],
        sense: [20, 30], luck: [20, 30], dodge: [20, 30], tenacity: [20, 30] },
    { grade: "极品", hp: [300, 400], mp: [30, 40], patk: [30, 40], pdef: [30, 40], matk: [30, 40], mdef: [30, 40],
        sense: [30, 40], luck: [30, 40], dodge: [30, 40], tenacity: [30, 40] },
    { grade: "仙品", hp: [400, 500], mp: [40, 50], patk: [40, 50], pdef: [40, 50], matk: [40, 50], mdef: [40, 50],
        sense: [40, 50], luck: [40, 50], dodge: [40, 50], tenacity: [40, 50] },
] as const satisfies readonly ItemGradeAttriRow[];


export const MAGIFICATION_TABLE = [
    { grade: "下品", magnification: [1.0, 1.1] },
    { grade: "中品", magnification: [1.1, 1.2] },
    { grade: "上品", magnification: [1.2, 1.4] },
    { grade: "上品", magnification: [1.4, 1.6] },
    { grade: "极品", magnification: [1.6, 1.8] },
    { grade: "仙品", magnification: [1.8, 2.0] },
] as const satisfies readonly { grade: string, magnification: [number, number] }[];
 
