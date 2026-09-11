const result = await fetch('http://127.0.0.1:3213/fixture/stop', { method: 'POST' });
if (!result.ok) throw new Error('Test fixture could not stop');
console.log('Requested isolated fixture cleanup and shutdown');
