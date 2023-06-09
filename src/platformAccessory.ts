import { Service, PlatformAccessory } from "homebridge";
import { HomebridgeCalPlatform } from "./platform.js";

export class HomebridgeCalAccessory {
  private service: Service;

  private state = {
    MotionDetected: false,
  };

  constructor(
    private readonly platform: HomebridgeCalPlatform,
    private readonly accessory: PlatformAccessory
  ) {
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, "buschco")
      .setCharacteristic(this.platform.Characteristic.Model, "cal-1")
      .setCharacteristic(this.platform.Characteristic.SerialNumber, "cal-1-1");

    this.service =
      this.accessory.getService(this.platform.Service.MotionSensor) ||
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    this.service
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.handleMotionDetectedGet.bind(this));

    setInterval(() => {
      const motionDetected =
        this.platform.lastScrape.eventsToday.find((event) =>
          event.name
            .toLowerCase()
            .includes(this.accessory.context.device.name.toLowerCase())
        ) != null;

      this.state.MotionDetected = motionDetected;

      this.service.updateCharacteristic(
        this.platform.Characteristic.MotionDetected,
        this.state.MotionDetected
      );
    }, 10000);
  }

  private handleMotionDetectedGet() {
    return this.state.MotionDetected;
  }
}
