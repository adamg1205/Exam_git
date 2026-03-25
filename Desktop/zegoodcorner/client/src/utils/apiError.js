export async function getApiErrorMessage(response, fallbackMessage) {
  try {
    const data = await response.json()
    if (data?.message && typeof data.message === 'string') {
      return data.message
    }
  } catch (_error) {
  }

  return fallbackMessage
}
