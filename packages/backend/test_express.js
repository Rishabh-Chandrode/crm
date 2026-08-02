import express from 'express';
const app = express();
app.get('/api/track/open/:sendId.gif', (req, res) => {
  console.log("SEND ID IS:", req.params.sendId);
  res.send('ok');
});
app.listen(3055, () => console.log('started'));
