import { http, HttpResponse } from 'msw';
import { mockScripts } from './mockData';

export const multiplePagesHandlers = [
  http.get('/api/scripts/all', () => {
    return HttpResponse.json(mockScripts);
  }),
  http.get('/api/remoteConfig', () => {
    return HttpResponse.json(
      JSON.stringify([
        {
          button1: { id: '1', name: 'Open Dome' },
          button2: { id: '2', name: 'Close Dome' },
          button3: { id: '3', name: 'Start Tracking' },
          button4: { id: '4', name: 'Stop Tracking' },
          button5: { id: '5', name: 'Emergency Stop' },
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '0', name: 'None' },
        },
        {
          button1: { id: '0', name: 'None' },
          button2: { id: '0', name: 'None' },
          button3: { id: '0', name: 'None' },
          button4: { id: '0', name: 'None' },
          button5: { id: '0', name: 'None' },
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '0', name: 'None' },
        },
        {
          button1: { id: '1', name: 'Open Dome' },
          button2: { id: '0', name: 'None' },
          button3: { id: '0', name: 'None' },
          button4: { id: '0', name: 'None' },
          button5: { id: '0', name: 'None' },
          button6: { id: '0', name: 'None' },
          button7: { id: '0', name: 'None' },
          button8: { id: '0', name: 'None' },
          button9: { id: '2', name: 'Close Dome' },
        },
      ]),
    );
  }),
];
