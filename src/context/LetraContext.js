// Interruptor "Letra grande" para vista cansada: multiplica los tamaños de
// letra de las pantallas principales (Vender, Productos, Ingreso, Clientes,
// Historial).
// Se guarda en config así viaja con el respaldo al cambiar de celular.
// No usa el ajuste del sistema a propósito: la bodeguera no sabe que existe.
import React, { createContext, useContext, useState, useCallback } from 'react'
import db from '../data/db'

export const FACTOR_LETRA_GRANDE = 1.3

const LetraContext = createContext({ grande: false, tx: (n) => n, alternar: async () => {} })

export function LetraProvider({ children }) {
  const [grande, setGrande] = useState(() => {
    try { return db.getConfig()?.letra_grande === true } catch { return false }
  })

  const tx = useCallback((base) => (grande ? Math.round(base * FACTOR_LETRA_GRANDE) : base), [grande])

  async function alternar() {
    const nuevo = !grande
    setGrande(nuevo)
    try { await db.updateConfig({ letra_grande: nuevo }) } catch { /* visual nada más */ }
  }

  return <LetraContext.Provider value={{ grande, tx, alternar }}>{children}</LetraContext.Provider>
}

export function useLetra() {
  return useContext(LetraContext)
}
