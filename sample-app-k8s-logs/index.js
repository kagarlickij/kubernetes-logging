var express = require('express')
var app = express()
const { createLogger, format, transports } = require('winston');

const filename = 'app.log';

const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.printf(info => `${info.timestamp} ${'FILE'} ${info.level}: ${info.message}`)
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.printf(
          info => ` ${info.timestamp} ${'CONSOLE'} ${info.level}: ${info.message}`
        )
      )
    }),
    new transports.File({ filename })
  ]
});

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  response.send('Hello World!')
  logger.info("app response was sent")
})

app.listen(app.get('port'), function() {
  logger.info("app was started")
})
