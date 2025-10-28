/***************************************************************************/
/* headerfile for "ee894I2c.cpp" module */
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

#ifndef ee894I2c_H
#define ee894I2c_H

#include "Arduino.h"
#include "Wire.h"

// Defines
//-----------------------------------------------------------------------------
#define CRC8_ONEWIRE_POLY 0x31
#define CRC8_ONEWIRE_START 0xff


// declaration of functions
//-----------------------------------------------------------------------------

class ee894I2c
{
public:
    ee894I2c(void);
    uint8_t getAllMeasurements(float &temperature, float &humidity, float &co2Aver, float &co2Raw, float &pressure);
    uint8_t getTempHum(float &temperature, float &humidity);
    uint8_t getCo2AverCo2RawPressure(float &co2Aver, float &co2Raw, float &pressure);
    void readSensorname(char Sensorname[]);
    void changeSensorname(char Sensorname[]);
    //CAM = customer adjustment mode
    uint8_t changeCAMDate(uint8_t measuredVariable, uint8_t day, uint8_t month, uint8_t year); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    void readCAMDate(uint8_t measuredVariable, uint8_t &day, uint8_t &month, uint8_t &year); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    void readCAM(uint8_t measuredVariable, int &offset, uint16_t &gain, uint16_t &lowerLimit, uint16_t &upperLimit); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeCAM(uint8_t measuredVariable, int offset, uint16_t gain, uint16_t lowerLimit, uint16_t upperLimit); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeOffsetInCAM(uint8_t measuredVariable, int offset); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeGainInCAM(uint8_t measuredVariable, uint16_t gain); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeLowerLimitInCAM(uint8_t measuredVariable, uint16_t lowerLimit); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeUpperLimitInCAM(uint8_t measuredVariable, uint16_t upperLimit); // 0 => relative humidity, 1 => temperature, 2 => pressure, 3 => CO2, 4 => global date
    uint8_t changeCo2MeasuringInterval(int measuringInterval); // min = 100 equivalent to 10 s,  max = 36000 equivalent to 1 hour
    void readCo2MeasuringInterval(float &measuringInterval); // in 0.1 s steps
    unsigned char address = 0x33;
    void wireWrite(unsigned char buf[], int to, bool stopmessage);
    void wireRead(unsigned char buf[], uint8_t to);
    unsigned char calcCrc8(unsigned char buf[], unsigned char from, unsigned char to);
    void getErrorString(uint8_t Status, char errorString[]);
};

#endif