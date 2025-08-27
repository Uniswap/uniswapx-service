/**
 * E2E tests for get-orders endpoint to ensure
 * 
 * These tests would have caught a memory issue introduced by a seemingly unrelated commit
 * that caused the Lambda to exceed its memory limit.
 */

import axios, { AxiosInstance } from 'axios'
import dotenv from 'dotenv'
import * as http from 'http'
import * as https from 'https'

dotenv.config()

describe('GET /dutch-auction/orders Stability Tests', () => {
  jest.setTimeout(30 * 1000) // 30 second timeout
  
  let URL: string
  let client: AxiosInstance

  beforeAll(async () => {
    if (!process.env.UNISWAPX_SERVICE_URL) {
      throw new Error('UNISWAPX_SERVICE_URL not set')
    }
    URL = process.env.UNISWAPX_SERVICE_URL
    
    // Create axios instance with proper configuration
    client = axios.create({
      baseURL: URL,
      timeout: 20000,
      // Disable keep-alive to prevent open handles
      httpAgent: new http.Agent({ keepAlive: false }),
      httpsAgent: new https.Agent({ keepAlive: false })
    })
  })

  afterAll(async () => {
    // Clean up any remaining connections
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  describe('Memory Usage Tests', () => {
    it('should not run out of memory on basic get-orders request', async () => {
      const response = await client.get(`dutch-auction/orders?chainId=1&limit=10`)
      
      // Should return 200, not 500 (Runtime.OutOfMemory)
      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('orders')
      expect(Array.isArray(response.data.orders)).toBe(true)
    })

    it('should handle concurrent get-orders requests', async () => {
      // Make multiple concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, () => 
        client.get(`dutch-auction/orders?chainId=1&limit=10`)
      )

      const responses = await Promise.all(concurrentRequests)
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
        expect(response.data).toHaveProperty('orders')
      })
    })

    it('should work for a variety of order types', async () => {
      const orderTypeTests = [
        '?chainId=1&type=Dutch_V2&limit=5', 
        '?chainId=1&type=Dutch_V3&limit=5',
        '?chainId=1&type=Priority&limit=5',
      ]

      for (const queryString of orderTypeTests) {
        try {
          const response = await client.get(`dutch-auction/orders${queryString}`)
          
          // Should return 200 or valid error (no 5xx)
          expect([200, 400, 404]).toContain(response.status)
          
          if (response.status === 200) {
            expect(response.data).toHaveProperty('orders')
          }
        } catch (error) {
          // If there's an error, it should be a client error (4xx) not server error (5xx)
          if (axios.isAxiosError(error) && error.response) {
            expect(error.response.status).toBeLessThan(500)
          } else {
            throw error
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid parameters', async () => {
      const invalidRequests = [
        '?chainId=1&limit=invalid',
        '?chainId=999999&limit=10',
        '?chainId=1&orderHash=invalid-hash',
        '?chainId=1&swapper=invalid-address',
      ]

      for (const queryString of invalidRequests) {
        try {
          const response = await client.get(`dutch-auction/orders${queryString}`)
          // If it succeeds, verify it's a valid response
          expect(response.status).toBe(200)
        } catch (error) {
          if (axios.isAxiosError(error) && error.response) {
            // Should be client error (4xx), not server error (5xx)
            expect(error.response.status).toBeGreaterThanOrEqual(400)
            expect(error.response.status).toBeLessThan(500)
          } else {
            throw error
          }
        }
      }
    })
  })
})
