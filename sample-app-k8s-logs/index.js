var express = require('express')
var app = express()
const { createLogger, format, transports } = require('winston');

const filename = 'app.log';

const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.printf(info => `${info.timestamp} ${'[INFO] [iam] [] [SERVICE] com.acs.service.RequestTask Receive service request with transaction Id [c5c35e52-a5e2-42b5-90fc-7fe9bc2abee9] to: iam:global:3:findComponent'}`)
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.combine(
        format.colorize(),
        format.printf(
          info => `${info.timestamp} ${'[INFO] [iam] [] [SERVICE] com.acs.service.RequestTask Receive service request with transaction Id [c5c35e52-a5e2-42b5-90fc-7fe9bc2abee9] to: iam:global:3:findComponent'}`
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
