const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '')

const API_PREFIX = '' // No extra prefix needed; paths match backend directly
const ACCESS_TOKEN_KEY = 'northstock-access-token'
export interface User {
  name: string
  email: string
}

export interface AuthTokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  user: {
    id: number
    name: string
    email: string
  }
}

let unauthorizedHandler: (() => void) | null = null

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function setAccessToken(token: string | null) {
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
  else localStorage.removeItem(ACCESS_TOKEN_KEY)
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export interface Product {
  id: number
  sku: string
  name: string
  category: string
  reorder_level: number
}

export interface ProductImportResponse {
  totalRows: number
  imported: number
  failed: number
  errors: {
    row: number
    sku: string
    message: string
  }[]
}
export interface Warehouse {
  id: number
  code: string
  name: string
  capacity: number
  isActive: boolean
}

export interface InventoryItem {
  id: number
  product_id: number
  warehouse_id: number
  quantity: number
  bin?: string
  product_sku?: string
  warehouse_code?: string
  reorder_level?: number
  low_stock?: boolean
  product_name?: string
  warehouse_name?: string
}


export interface InitialStockImportResponse {
  totalRows: number
  imported: number
  failed: number
  errors: {
    row: number
    product_sku: string
    warehouse_code: string
    message: string
  }[]
}


export interface Customer {
  id: number
  name: string
  email: string
}

export interface OrderItem {
  id?: number
  product_id: number
  warehouse_id: number
  quantity: number
}

export interface Order {
  id: number
  customer_id: number
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | string
  createdAt?: string
  created_at?: string
  items: OrderItem[]
}

export interface Movement {
  id: number
  type?: string
  quantity_change?: number
}

async function request<T>(
  path: string,
  init?: RequestInit,
  authenticated = true,
): Promise<T> {
  const token = authenticated ? getAccessToken() : null

  const headers = new Headers(init?.headers)

  if (init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}${path}`,
    {
      ...init,
      headers,
    },
  )

  if (!response.ok) {
    if (response.status === 401 && token && getAccessToken() === token) {
      setAccessToken(null)
      unauthorizedHandler?.()
    }

    const body = await response.text()
    let message = body

    if (body) {
      try {
        const problem = JSON.parse(body) as {
          detail?: string
          title?: string
        }

        message = problem.detail || problem.title || body
      } catch {
        message = body
      }
    }

    throw new Error(message || `Request failed (${response.status})`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}


const json = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
})

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      request<AuthTokenResponse>('/auth/login', json('POST', data), false),
    register: (data: { name: string; email: string; password: string }) =>
      request<AuthTokenResponse>('/auth/register', json('POST', data), false),
  },
  users: {
    me: () => request<User>('/users/me'),
  },
  products: {
    getAll: () => request<Product[]>('/product'),
    getById: (id: number) => request<Product>(`/product/${id}`),
    create: (data: Omit<Product, 'id'>) => request<Product>('/product', json('POST', data)),
    update: (id: number, data: Omit<Product, 'id'>) => request<Product>(`/product/${id}`, json('PUT', data)),
    delete: (id: number) => request<void>(`/product/${id}`, json('DELETE')),
    importCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return request<ProductImportResponse>('/product/import', {
      method: 'POST',
      body: formData,
    })
  },
  },
  warehouses: {
    getAll: () => request<Warehouse[]>('/warehouse'),
    getById: (id: number) => request<Warehouse>(`/warehouse/${id}`),
    create: (data: Omit<Warehouse, 'id' | 'isActive'>) => request<Warehouse>('/warehouse', json('POST', data)),
    update: (id: number, data: Omit<Warehouse, 'id'>) => request<Warehouse>(`/warehouse/${id}`, json('PUT', data)),
    delete: (id: number) => request<void>(`/warehouse/${id}`, json('DELETE')),    
    importCsv: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      return request<Warehouse[]>('/warehouse/import', {
        method: 'POST',
        body: formData,
      })
},

  },
  inventory: {
    getAll: (warehouseId?: number) =>
      request<InventoryItem[]>(warehouseId === undefined ? '/inventory' : `/inventory?warehouse_id=${warehouseId}`),
    lowStock: () => request<InventoryItem[]>('/inventory/low-stock'),
    getByLocation: (productId: number, warehouseId: number) =>
      request<InventoryItem>(`/inventory/${productId}/${warehouseId}`),
    movements: (productId: number, warehouseId: number) =>
      request<Movement[]>(`/inventory/${productId}/${warehouseId}/movements`),
    adjust: (data: { product_id: number; warehouse_id: number; quantity: number; movementType: string }) =>
      request<InventoryItem>('/inventory/adjustments', json('POST', data)),
    transfer: (data: { product_id: number; from_warehouse_id: number; to_warehouse_id: number; quantity: number }) =>
      request<InventoryItem[]>('/inventory/transfers', json('POST', data)),
    
    importInitialStock: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      return request<InitialStockImportResponse>(
        '/inventory/initial-stock/import',
        {
          method: 'POST',
          body: formData,
        },
      )
    },
  },
  customers: {
    getAll: () => request<Customer[]>('/customer'),
    getById: (id: number) => request<Customer>(`/customer/${id}`),
    create: (data: Omit<Customer, 'id'>) => request<Customer>('/customer', json('POST', data)),
  },
  orders: {
    getAll: () => request<Order[]>('/order'),
    getById: (id: number) => request<Order>(`/order/${id}`),
    pending: () => request<Order[]>('/order/pending'),
    create: (data: { customer_id: number; items: OrderItem[] }) =>
      request<Order>('/order', json('POST', data)),
    cancel: (id: number) => request<Order>(`/order/${id}/cancel`, json('PUT')),
  },
}
