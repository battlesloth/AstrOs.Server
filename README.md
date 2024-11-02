# AstrOs.Server

AstrOs is an astromech operating system. It's purpose is to provide a (mostly) turnkey animation scripting and control solution for R2 builders. AstrOs currently does not provide drive capability but can be intergrated with exisiting drive systems if you are willing write your own code. Once AstrOs hits beta, we will begin looking at providing direct integration paths to exisiting systems.

This repository is for the AstrOs.Server, a Node.js/Express/Angular server for designing animations and managing microcontroller configurations. By design, it is intended to run in a docker container on a single board computer that has a serial port available (such as a RaspberryPi or OrangePi), though should be able to be run on any system that supports nodejs and can provide the API server access to serial communication. It is intended to be paired with https://github.com/battlesloth/AstrOs.ESP to provide microcontroller support, though the serial communication protocol and scripting format (documented below in the Protocol and Scripting Format sections respectively) could be leveraged by other platforms.

## Getting Started

To run the project, you will need Node.js installed (current development target is Node.js 20). VS Code is the IDE that has been used for all development and there are launch and task files provided in the repository.

### Prerequisites

TODO

### Installing

TODO

## Running the tests

TODO

### Break down into end to end tests

TODO

### And coding style tests

TODO

## Deployment

### Armbian Orange Pi 4 LTS Set Up

#### Enable Pi Serial - Armbain Headless

Orange Pi 4 LTS shares SPI1 and UART4 and by default, SPI1 is endabled. To enable UART4 and disable SPI1, you need to create a DT Overlay.

From a termainal on the Orange Pi:
```
~$ nano rockschip-uart.dts
```

Add the following:

```
/dts-v1/;
/plugin/;

/{
 	compatible="rockchip,rk3399";
 	fragment@0{
 		target=<&spi1>;
 		__overlay__{
 			status="disabled";
 		};
 	};

 	fragment@1{
 		target=<&uart4>;
 		__overlay__{
 			status="okay";
 		};
 	};
};
```

Build the dtbo file

```
~$ dtc -@ -Hepapr -I dts -O dtb -o rockchip-uart4.dtbo rockchip-uart4.dts
```

If /boot/overlay/ doesn't exist, create the folder.

Copy rockchip-uart4.dtbo to /boot/overlay/

Edit boot/armbianEnv.txt and add the following line

```
overlays=uart4
```

reboot


#### Enable Pi Serial - Armbain Desktop

use Armbian Config utility

#### Setup Docker Environment

create database file/logging location

```
~$ cd .config
~$ mkdir astrosserver
```

Install docker. This may take a while. Especially the "Setting up docker.io" step.
```
~$ sudo apt install docker.io
```
Create directory to save docker data:

```
~$ mkdir /home/<user>/Docker/Data/portainer
```

Install portainer. 
```
 ~$ docker pull portainer/portainer
```



Create container and auto run portainer 
```
docker run -d -p 9000:9000 --restart always \
-v /var/run/docker.sock:/var/run/docker.sock \
-v /home/<user>/Docker/Data/portainer:/data portainer/portainer
```

In Portainer:

Create docker network

portainer>local environment>networks
        
Add Network> AstroNet, Bridge

portainer> Stacks
        give it a name (i.e. astros)
        add stack, paste docker-compose.yml from deployment


## Built With

TODO

## Contributing

TODO

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags).

## Authors

- **Jeff Rector** - _Initial work_ - [BattleSloth](https://github.com/BattleSloth)

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License

This project is licensed under the GPL3 License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

TODO
