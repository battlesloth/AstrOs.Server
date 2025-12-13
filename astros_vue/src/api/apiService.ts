import axios from 'axios'

const apiClient = axios.create({
    baseURL: import.meta.env.BACKEND_API || 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
})

apiClient.defaults.withCredentials = true

export default {
    async get(url: string) {
        try {
            const response = await apiClient.get(url)
            return response.data
        } catch (error) {
            console.error('Error fetching data:', error)
            throw error
        }
    },

    async getBlob(url: string): Promise<Blob> {
        try {
            const response = await apiClient.get(url, {
                responseType: 'blob',
            })
            return response.data
        } catch (error) {
            console.error('Error fetching blob:', error)
            throw error
        }
    },

    async post(url: string, data: unknown) {
        try {
            const response = await apiClient.post(url, data)
            return response.data
        } catch (error) {
            console.error('Error posting data:', error)
            throw error
        }
    },

    async delete(url: string) {
        try {
            const response = await apiClient.delete(url)
            return response.data
        } catch (error) {
            console.error('Error deleting data:', error)
            throw error
        }
    },
}