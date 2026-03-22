require('./server/index.js');
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://pgis.onrender.com");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});
