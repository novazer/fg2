/***************************************************************************/
/* sourcefile for "ee894I2c.h" module */
/***************************************************************************/
/*
Read functions for measurement values of the EE894 Sensor via I2C interface.

Copyright 2022 E+E Elektronik Ges.m.b.H.

Disclaimer:
This application example is non-binding and does not claim to be complete with regard
to configuration and equipment as well as all eventualities. The application example
is intended to provide assistance with the EE894 sensor module design-in and is provided "as is".
You yourself are responsible for the proper operation of the products described.
This application example does not release you from the obligation to handle the product safely
during application, installation, operation and maintenance. By using this application example,
you acknowledge that we cannot be held liable for any damage beyond the liability regulations
described.

We reserve the right to make changes to this application example at any time without notice.
In case of discrepancies between the suggestions in this application example and other E+E
publications, such as catalogues, the content of the other documentation takes precedence.
We assume no liability for the information contained in this document.
*/

// Includes
//-----------------------------------------------------------------------------
#include "ee894.h"
#include <Arduino.h>
#include "Wire.h"


enum Errorcode
{
    OKAY = 0,
    ERR_CKSUM = 1,
    ERR_NOT_IN_SPEC = 2,
};


ee894I2c::ee894I2c(void)
{

}

uint8_t ee894I2c::getAllMeasurements(float &temperature, float &humidity, float &co2Aver, float &co2Raw, float &pressure)
{
  if(0 < getTempHum(temperature, humidity) || 0 < getCo2AverCo2RawPressure(co2Aver, co2Raw, pressure))
  {
    return 1;
  }
  else
  {
    return 0;
  }
}


uint8_t ee894I2c::getTempHum(float &temperature, float &humidity)
{
  unsigned char Command[] = {0xE0, 0x00};
  unsigned char i2cResponse[6];
  wireWrite(Command, 1, true);
  wireRead(i2cResponse, 6);
  // Check the data with CRC8
  if (i2cResponse[2] != calcCrc8(i2cResponse, 0, 1) || i2cResponse[5] != calcCrc8(i2cResponse, 3, 4))
  {
    return 1;
  }
  else
  {
    temperature = (((float)(i2cResponse[0]) * 256 + i2cResponse[1]) / 100) - 273.15;
    humidity = ((float)(i2cResponse[3]) * 256 + i2cResponse[4]) / 100;
    return 0;
  }
}


uint8_t ee894I2c::getCo2AverCo2RawPressure(float &co2Aver, float &co2Raw, float &pressure)
{
  unsigned char Command[] = {0xE0, 0x27};
  unsigned char i2cResponse[9];
  wireWrite(Command, 1, true);
  wireRead(i2cResponse, 9);
  // Check the data with CRC8
  if (i2cResponse[2] != calcCrc8(i2cResponse, 0, 1) || i2cResponse[5] != calcCrc8(i2cResponse, 3, 4) || i2cResponse[8] != calcCrc8(i2cResponse, 6, 7))
  {
    return 1;
  }
  else
  {
    co2Aver = ((float)(i2cResponse[0]) * 256 + i2cResponse[1]);
    co2Raw = ((float)(i2cResponse[3]) * 256 + i2cResponse[4]);
    pressure = ((float)(i2cResponse[6]) * 256 + i2cResponse[7]) / 10;
    return 0;
  }
}


void ee894I2c::readSensorname(char Sensorname[])
{
  unsigned char i2cResponse[17];
  unsigned char Command[] = {0x71, 0x54, 0x0A};
  wireWrite(Command, 2, true);
  wireRead(i2cResponse, 16);
  for (int i = 0; i < 16; i++)
  {
    Sensorname[i] = i2cResponse[i];
  }
}


void ee894I2c::changeSensorname(char Sensorname[])
{
  unsigned char Command[20] = {0x71, 0x54, 0x0A};
  for (int i = 0; i < 16; i++)
  {
    Command[i+3] = Sensorname[i];
  }
  Command[19] = calcCrc8(Command, 2, 18);
  wireWrite(Command, 19, true);
  delay(500);
}

//CAM = customer adjustment mode
uint8_t ee894I2c::changeCAMDate(uint8_t measuredVariable, uint8_t day, uint8_t month, uint8_t year) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
{
  if((day < 32 && day > 0) && (month < 13 && month > 0) && (year < 100 && year >= 0))
  {
    unsigned char Command[7] = {0x71, 0x54, 0x00};
    Command[2] = measuredVariable + 5;
    Command[3] = day;
    Command[4] = month;
    Command[5] = year;
    Command[6] = calcCrc8(Command, 2, 5);
    wireWrite(Command, 6, true);
    delay(500);
    return 0;
  }
  else
  {
    return 2;
  }
}


void ee894I2c::readCAMDate(uint8_t measuredVariable, uint8_t &day, uint8_t &month, uint8_t &year) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
{
  unsigned char Command[7] = {0x71, 0x54, 0x00};
  unsigned char i2cResponse[3];
  Command[2] = measuredVariable + 5;
  wireWrite(Command, 2, true);
  wireRead(i2cResponse, 3);
  day = i2cResponse[0];
  month = i2cResponse[1];
  year = i2cResponse[2];
}


void ee894I2c::readCAM(uint8_t measuredVariable, int &offset, uint16_t &gain, uint16_t &lowerLimit, uint16_t &upperLimit) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  unsigned char Command[7] = {0x71, 0x54, 0x00};
  Command[2] = measuredVariable + 1;
  unsigned char i2cResponse[8];
  wireWrite(Command, 2, true);
  wireRead(i2cResponse, 8);
  offset = (i2cResponse[0] << 8) + i2cResponse[1];
  gain = (i2cResponse[2] << 8) + i2cResponse[3];
  lowerLimit = (i2cResponse[4] << 8) + i2cResponse[5];
  upperLimit = (i2cResponse[6] << 8) + i2cResponse[7];
}


uint8_t ee894I2c::changeCAM(uint8_t measuredVariable, int offset, uint16_t gain, uint16_t lowerLimit, uint16_t upperLimit) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  unsigned char Command[12] = {0x71, 0x54, 0x00};
  Command[2] = measuredVariable + 1;
  Command[3] = (offset >> 8);
  Command[4] = offset & 0xFF;
  Command[5] = (gain >> 8);
  Command[6] = gain & 0xFF;
  Command[7] = (lowerLimit >> 8);
  Command[8] = lowerLimit & 0xFF;
  Command[9] = (upperLimit >> 8);
  Command[10] = upperLimit & 0xFF;
  Command[11] = calcCrc8(Command, 2, 10);
  wireWrite(Command, 11, true);
  delay(500);
  return 0;
}

uint8_t ee894I2c::changeOffsetInCAM(uint8_t measuredVariable, int offset) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  uint16_t gain, lowerLimit, upperLimit;
  int oldOffset;
  readCAM(measuredVariable, oldOffset, gain, lowerLimit, upperLimit);
  changeCAM(measuredVariable, offset, gain, lowerLimit, upperLimit);
  return 0;
}


uint8_t ee894I2c::changeGainInCAM(uint8_t measuredVariable, uint16_t gain) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  uint16_t oldGain, lowerLimit, upperLimit;
  int offset;
  readCAM(measuredVariable, offset, oldGain, lowerLimit, upperLimit);
  changeCAM(measuredVariable, offset, gain, lowerLimit, upperLimit);
  return 0;
}


uint8_t ee894I2c::changeLowerLimitInCAM(uint8_t measuredVariable, uint16_t lowerLimit) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  uint16_t gain, oldLowerLimit, upperLimit;
  int offset;
  readCAM(measuredVariable, offset, gain, oldLowerLimit, upperLimit);
  changeCAM(measuredVariable, offset, gain, lowerLimit, upperLimit);
  return 0;
}


uint8_t ee894I2c::changeUpperLimitInCAM(uint8_t measuredVariable, uint16_t upperLimit) // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2
{
  uint16_t gain, lowerLimit, oldUpperLimit;
  int offset;
  readCAM(measuredVariable, offset, gain, lowerLimit, oldUpperLimit);
  changeCAM(measuredVariable, offset, gain, lowerLimit, upperLimit);
  return 0;
}


uint8_t ee894I2c::changeCo2MeasuringInterval(int measuringInterval) // min = 100 equivalent to 10 s,  max = 36000 equivalent to 1 hour
{
  if(36001 > measuringInterval && measuringInterval > 99)
  {
    unsigned char sendByte0 = measuringInterval / 256;
    unsigned char sendByte1 = measuringInterval % 256;
    unsigned char Command[6] = {0x71, 0x54, 0x00, sendByte0, sendByte1, 0x00};
    Command[5] = calcCrc8(Command, 2, 4);
    wireWrite(Command, 5, true);
  }
  else
  {
    return 2;
  }
  delay(500);
  return 0;
}


void ee894I2c::readCo2MeasuringInterval(float &measuringInterval) // in 0.1 s steps
{
  unsigned char i2cResponse[2];
  unsigned char Command[] = {0x71, 0x54, 0x00};
  wireWrite(Command, 2, true);
  wireRead(i2cResponse, 2);
  measuringInterval = ((float)(i2cResponse[0]) * 256 + i2cResponse[1]) / 10;
}


void ee894I2c::wireWrite(unsigned char buf[], int to, bool stopmessage)
{
  Wire.beginTransmission(address);
  for (int i = 0; i <= to; i++)
  {
    Wire.write(buf[i]);
  }
  Wire.endTransmission(stopmessage);
}

void ee894I2c::wireRead(unsigned char buf[], uint8_t to)
{
  int i = 0;
  Wire.requestFrom(address, to);
  while (Wire.available())
  {
    buf[i++] = Wire.read();
  }
}

unsigned char ee894I2c::calcCrc8(unsigned char buf[], unsigned char from, unsigned char to)
{
  unsigned char crcVal = CRC8_ONEWIRE_START;
  unsigned char i = 0;
  unsigned char j = 0;
  for (i = from; i <= to; i++)
  {
    int curVal = buf[i];
    for (j = 0; j < 8; j++)
    {
      if (((crcVal ^ curVal) & 0x80) != 0) //if MSBs are not equal
      {
        crcVal = ((crcVal << 1) ^ CRC8_ONEWIRE_POLY);
      }
      else
      {
        crcVal = (crcVal << 1);
      }
      curVal = curVal << 1;
    }
  }
  return crcVal;
}


void ee894I2c::getErrorString(uint8_t Status, char errorString[])
{
  //memset(errorString, '\0', sizeof(errorString));
  switch (Status)
  {
  case OKAY:
    strcpy(errorString, "Success");
    break;
  case ERR_CKSUM:
    strcpy(errorString, "Checksum error");
    break;
  case ERR_NOT_IN_SPEC:
    strcpy(errorString, "You have choosen a number that is not in spec or makes no sense");
    break;
  default:
    strcpy(errorString, "unknown error");
    break;
  }
}