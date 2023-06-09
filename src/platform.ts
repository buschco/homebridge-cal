import dayjs from "dayjs";
import fetch from "node-fetch";
import ICAL from "ical.js";
import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";
import { HomebridgeCalAccessory } from "./platformAccessory.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import { access } from "fs";

export class HomebridgeCalPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  private interval;
  public lastScrape: {
    eventsToday: { start: string; name: string }[];
    today?: string;
  } = { eventsToday: [], today: undefined };

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);

    const scrapeBindedWhyDoClassesSuckSoHard = this.scrapeCalendar.bind(this);
    scrapeBindedWhyDoClassesSuckSoHard();

    this.api.on("didFinishLaunching", () => {
      this.interval = setInterval(
        scrapeBindedWhyDoClassesSuckSoHard,
        10 * 60 * 1000
      );
      this.discoverDevices();
    });

    this.api.on("shutdown", () => {
      if (this.interval == null) return;
      clearInterval(this.interval);
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("cb Loading accessory from cache:", accessory.displayName);

    this.accessories.push(accessory);
  }

  async scrapeCalendar() {
    try {
      if (
        this.lastScrape.today != null &&
        dayjs(this.lastScrape.today).add(4, "hours").isBefore() === false
      ) {
        return;
      }

      this.log.info("scraping calendar");
      if (
        this.config.calurl == null ||
        this.config.calurl.startsWith("http") === false
      ) {
        throw new Error(`calurl missing or invalid: [${this.config.calurl}]`);
      }

      const response = await fetch(this.config.calurl);
      const iCalText = await response.text();

      const jCalData = ICAL.parse(iCalText);
      if (jCalData[0] !== "vcalendar") {
        throw new Error("no calendar data found");
      }

      const vCalendar = new ICAL.Component(jCalData);
      const vEvents = vCalendar.getAllSubcomponents("vevent");
      const vTimezone = vCalendar.getFirstSubcomponent("vtimezone");

      const eventsToday: {
        start: string;
        name: string;
      }[] = [];

      const now = dayjs();

      vEvents.forEach((vEvents) => {
        const event = new ICAL.Event(vEvents);

        if (vTimezone) {
          const zone = new ICAL.Timezone(vTimezone);
          event.startDate = event.startDate.convertToZone(zone);
          event.endDate = event.endDate.convertToZone(zone);
        }

        const eventStart = dayjs(event.startDate.toJSDate());

        if (eventStart.isSame(now, "day") === false) return;

        eventsToday.push({
          name: event.summary,
          start: eventStart.toISOString(),
        });
      });

      this.lastScrape = { eventsToday, today: now.toISOString() };
    } catch (error) {
      this.log.error(error instanceof Error ? error.message : "unknown error");
    }
  }

  discoverDevices() {
    let existingAccessories = [...this.accessories];
    (this.config.events ?? []).forEach((deviceName) => {
      const uuid = this.api.hap.uuid.generate(deviceName);

      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid
      );

      if (existingAccessory != null) {
        existingAccessories = existingAccessories.filter(
          (accessory) => accessory.UUID !== uuid
        );
        this.log.info(
          "Restoring existing accessory from cache:",
          existingAccessory.displayName
        );

        new HomebridgeCalAccessory(this, existingAccessory);
      } else {
        this.log.info("Adding new accessory:", deviceName);
        const accessory = new this.api.platformAccessory(deviceName, uuid);
        accessory.context.device = { name: deviceName };
        new HomebridgeCalAccessory(this, accessory);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ]);
      }
    });
    this.api.unregisterPlatformAccessories(
      PLUGIN_NAME,
      PLATFORM_NAME,
      existingAccessories
    );
  }
}
