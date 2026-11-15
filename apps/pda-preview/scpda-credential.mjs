// Wire key remains `pin` for reader-v1 compatibility; preserve password exactly.
export const validScpdaCredential=value=>typeof value==='string'&&value.length<=64&&!/[^!-~]/.test(value)&&(/^[0-9]{4}$/.test(value)||value.length>=6);
