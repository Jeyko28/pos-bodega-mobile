import React, { createContext, useContext } from 'react'

export const SesionContext = createContext(null)
export function useSesion() { return useContext(SesionContext) }
