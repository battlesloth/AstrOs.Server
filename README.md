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

TOD

## Deployment

TODO

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
