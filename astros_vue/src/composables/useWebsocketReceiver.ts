export function useWebsocketReceiver() {
  // Implementation of the websocket receiver logic

  function handleMessage(message: string) {
    console.log('Received message:', message);
    // Process the message as needed
  }

  return {
    handleMessage
  };
}