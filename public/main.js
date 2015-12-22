'use strict';
window.app = angular.module('GeoQuest', ['fsaPreBuilt', 'ui.router', 'ui.sortable', 'ui.bootstrap', 'ngAnimate', 'leaflet-directive']);

app.config(function ($urlRouterProvider, $locationProvider) {
	// This turns off hashbang urls (/#about) and changes it to something normal (/about)
	$locationProvider.html5Mode(true);
	// If we go to a URL that ui-router doesn't have registered, go to the "/" url.
	$urlRouterProvider.otherwise('/dashboard');
});

// This app.run is for controlling access to specific states.
app.run(function ($rootScope, AuthService, $state) {

	// The given state requires an authenticated user.
	var destinationStateRequiresAuth = function destinationStateRequiresAuth(state) {
		return state.data && state.data.authenticate;
	};

	// $stateChangeStart is an event fired
	// whenever the process of changing a state begins.
	$rootScope.$on('$stateChangeStart', function (event, toState, toParams) {

		if (!destinationStateRequiresAuth(toState)) {
			// The destination state does not require authentication
			// Short circuit with return.
			return;
		}

		if (AuthService.isAuthenticated()) {
			// The user is authenticated.
			// Short circuit with return.
			return;
		}

		// Cancel navigating to new state.
		event.preventDefault();

		AuthService.getLoggedInUser().then(function (user) {
			// If a user is retrieved, then renavigate to the destination
			// (the second time, AuthService.isAuthenticated() will work)
			// otherwise, if no user is logged in, go to "login" state.
			if (user) {
				$state.go(toState.name, toParams);
			} else {
				$state.go('login');
			}
		});
	});
});

(function () {

	'use strict';

	// Hope you didn't forget Angular! Duh-doy.
	if (!window.angular) throw new Error('I can\'t find Angular!');

	var app = angular.module('fsaPreBuilt', []);

	app.factory('Socket', function () {
		if (!window.io) throw new Error('socket.io not found!');
		return window.io(window.location.origin);
	});

	// AUTH_EVENTS is used throughout our app to
	// broadcast and listen from and to the $rootScope
	// for important events about authentication flow.
	app.constant('AUTH_EVENTS', {
		loginSuccess: 'auth-login-success',
		loginFailed: 'auth-login-failed',
		logoutSuccess: 'auth-logout-success',
		sessionTimeout: 'auth-session-timeout',
		notAuthenticated: 'auth-not-authenticated',
		notAuthorized: 'auth-not-authorized'
	});

	app.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
		var statusDict = {
			401: AUTH_EVENTS.notAuthenticated,
			403: AUTH_EVENTS.notAuthorized,
			419: AUTH_EVENTS.sessionTimeout,
			440: AUTH_EVENTS.sessionTimeout
		};
		return {
			responseError: function responseError(response) {
				$rootScope.$broadcast(statusDict[response.status], response);
				return $q.reject(response);
			}
		};
	});

	app.config(function ($httpProvider) {
		$httpProvider.interceptors.push(['$injector', function ($injector) {
			return $injector.get('AuthInterceptor');
		}]);
	});
	app.service('AuthService', function ($http, Session, $rootScope, AUTH_EVENTS, $q) {

		function onSuccessfulLogin(response) {
			var data = response.data;
			Session.create(data.id, data.user);
			$rootScope.$broadcast(AUTH_EVENTS.loginSuccess);
			return data.user;
		}

		// Uses the session factory to see if an
		// authenticated user is currently registered.
		this.isAuthenticated = function () {
			return !!Session.user;
		};

		this.getLoggedInUser = function (fromServer) {

			// If an authenticated session exists, we
			// return the user attached to that session
			// with a promise. This ensures that we can
			// always interface with this method asynchronously.

			// Optionally, if true is given as the fromServer parameter,
			// then this cached value will not be used.

			if (this.isAuthenticated() && fromServer !== true) {
				return $q.when(Session.user);
			}

			// Make request GET /session.
			// If it returns a user, call onSuccessfulLogin with the response.
			// If it returns a 401 response, we catch it and instead resolve to null.
			return $http.get('/session').then(onSuccessfulLogin)['catch'](function () {
				return null;
			});
		};

		this.login = function (credentials) {
			return $http.post('/login', credentials).then(onSuccessfulLogin)['catch'](function () {
				return $q.reject({ message: 'Invalid login credentials.' });
			});
		};

		this.signup = function (credentials) {
			//sends a post request containing the user's credentials to
			return $http.post('api/users/signup', credentials)
			//once the user has been created on the backend...
			.then(function (response) {
				//a second post request is created to log the user in
				return $http.post('/login', credentials);
			}).then(onSuccessfulLogin)['catch'](function () {
				return $q.reject({ message: 'Invalid signup credentials.' });
			});
		};

		this.logout = function () {
			return $http.get('/logout').then(function () {
				Session.destroy();
				$rootScope.$broadcast(AUTH_EVENTS.logoutSuccess);
			});
		};
	});

	app.service('Session', function ($rootScope, AUTH_EVENTS) {

		var self = this;

		$rootScope.$on(AUTH_EVENTS.notAuthenticated, function () {
			self.destroy();
		});

		$rootScope.$on(AUTH_EVENTS.sessionTimeout, function () {
			self.destroy();
		});

		this.id = null;
		this.user = null;

		this.create = function (sessionId, user) {
			this.id = sessionId;
			this.user = user;
		};

		this.destroy = function () {
			this.id = null;
			this.user = null;
		};
	});
})();

app.config(function ($stateProvider) {
	$stateProvider.state('editor.questStep', {
		url: '/queststep/:questStepId',
		templateUrl: 'js/quest-step-editor/quest-step-editor.html',
		controller: 'QuestStepEditCtrl',
		resolve: {
			quest: function quest(QuestFactory, $stateParams) {
				return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('QuestStepEditCtrl', function ($stateParams, $scope, $state, $rootScope, quest, QuestFactory) {
	$scope.quest = quest;
	$rootScope.editorVisible = false;
	$scope.viewMap = true;
	var userLocation;
	$scope.targetError = false;
	$scope.titleError = false;

	//defind new Step for adding to steps array
	$scope.newStep = {
		name: 'New Step',
		targetCircle: {
			center: [],
			radius: null
		}
	};
	// if we have steps, find the index of the step that matches the params
	if ($scope.quest.questSteps.length > 0) {
		$scope.quest.questSteps.forEach(function (step, index) {
			if (step._id === $stateParams.questStepId) {
				$scope.quest.idx = index;
			}
		});
		//sets currentStep to that matching the parameters
		$scope.currentStep = $scope.quest.questSteps[$scope.quest.idx];
	} else {
		$scope.quest.questSteps.push($scope.newStep);
		$scope.currentStep = $scope.quest.questSteps[0];
	}
	//function to switch states within mapState editor
	$scope.switchStep = function (clickedStep) {
		if ($scope.currentStep.targetCircle.center.length && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.title) {
			QuestFactory.save($scope.quest).then(function () {
				// redirect to the clicked mapstate
				$state.go('editor.questStep', { questStepId: clickedStep._id });
			});
		} else {
			if (!$scope.currentStep.targetCircle.center.length) flashError('targetError');
			if (!$scope.currentStep.transitionInfo || !$scope.currentStep.transitionInfo.title) flashError('titleError');
		}
	};
	$scope.saveQuestSteps = function () {
		if ($scope.currentStep.targetCircle.center.length) {
			//update quest
			QuestFactory.save($scope.quest).then(function (updatedQuest) {
				$scope.quest = updatedQuest;
				$state.go('editor', { id: $scope.quest._id }, { reload: true });
			});
		} else flashError('targetError');
	};
	$scope.addQuestStep = function () {
		$scope.quest.questSteps.push($scope.newStep);
		return QuestFactory.save($scope.quest).then(function (updatedQuest) {
			$scope.quest = updatedQuest;
			$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[$scope.quest.questSteps.length - 1]._id });
		});
	};
	$scope.removeQuestStep = function () {
		var index = $scope.quest.questSteps.indexOf($scope.currentStep);
		$scope.quest.questSteps.splice(index, 1);
		if (index === $scope.quest.questSteps.length) index--;
		return QuestFactory.save($scope.quest).then(function (updatedQuest) {
			$scope.quest = updatedQuest;
			var stepDestination = $scope.quest.questSteps.length === 0 ? null : $scope.quest.questSteps[index]._id;
			$state.go('editor.questStep', { questStepId: stepDestination }, { reload: true });
		});
	};

	function flashError(errorType) {
		$scope[errorType] = true;
		setTimeout(function () {
			$scope[errorType] = false;
			$scope.$digest();
		}, 3000);
	}

	// MAP BELOW ===================================>>

	// initialize map
	var questStepMap = L.map('quest-step-map');
	questStepMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	//add pirate map tiles
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questStepMap);

	// Set view using targetCircle for this step if defined
	// Then try first targetCircle for quest if defined
	// Otherwise get user's location and set map view with that
	if ($scope.currentStep.targetCircle.center.length === 2) {
		questStepMap.setView($scope.currentStep.targetCircle.center, 15);
	} else if ($scope.quest.questSteps[0].targetCircle.center.length === 2) {
		questStepMap.setView($scope.quest.questSteps[0].targetCircle.center, 15);
	} else {
		questStepMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questStepMap.setView(userLocation, 15);
		});
	}

	// Initialize the FeatureGroup to store editable layers
	var drawnItems = new L.FeatureGroup();
	questStepMap.addLayer(drawnItems);

	// Initialize the draw control and pass it the FeatureGroup of editable layers
	var drawControl = new L.Control.Draw({
		draw: {
			polyline: false,
			polygon: false,
			rectangle: false,
			marker: false
		},
		edit: {
			featureGroup: drawnItems
		}
	});
	questStepMap.addControl(drawControl);
	//if there is a target region, draw it on the map
	if ($scope.currentStep.targetCircle.center.length === 2) {
		var currentRegion = L.circle($scope.currentStep.targetCircle.center, $scope.currentStep.targetCircle.radius);
		questStepMap.addLayer(currentRegion);
	}
	var circle;
	questStepMap.on('draw:created', function (e) {
		//remove the loaded region then remove any newly drawn circles
		if (currentRegion) questStepMap.removeLayer(currentRegion);
		if (circle) questStepMap.removeLayer(circle);
		var type = e.layerType;
		var layer = e.layer;
		//assign target region to properties of drawn object
		$scope.currentStep.targetCircle.center = [layer._latlng.lat, layer._latlng.lng];
		$scope.currentStep.targetCircle.radius = layer._mRadius;
		//declare new object based on propertied drawn and add to map
		circle = L.circle([layer._latlng.lat, layer._latlng.lng], layer._mRadius);
		questStepMap.addLayer(circle);
	});

	$scope.getModalButtonText = function () {
		if ($scope.currentStep && $scope.currentStep.transitionInfo && $scope.currentStep.transitionInfo.question) return "Submit!";
		return "Got it!";
	};
});

app.config(function ($stateProvider) {

	$stateProvider.state('home', {
		url: '/',
		templateUrl: 'js/home/home.html',
		controller: 'HomeCtrl',
		resolve: {
			requestedUser: function requestedUser(AuthService) {
				return AuthService.getLoggedInUser();
			}
		}
	});
});

app.controller('HomeCtrl', function ($scope, AuthService, $state, requestedUser) {
	// If there's a logged in user upon load, go to the dashboard
	if (requestedUser) $state.go('dashboard', { userId: requestedUser._id });

	$scope.home = true; // To know what nav links to show
	$scope.login = {};
	$scope.signup = {};
	$scope.loginError = null;
	$scope.signupError = null;

	$scope.sendLogin = function (loginInfo) {
		$scope.error = null;
		console.log('loginInfo', loginInfo);
		AuthService.login(loginInfo).then(function (user) {
			console.log('found existing user', user);
			$state.go('dashboard', { userId: user._id });
		})['catch'](function () {
			$scope.loginError = "I think you\'ve entered the wrong info, friend";
		});
	};

	$scope.sendSignup = function (signupInfo) {
		console.log('loginInfo', signupInfo);
		$scope.error = null;
		AuthService.signup(signupInfo).then(function (user) {
			console.log('made new user', user);
			$state.go('dashboard', { userId: user._id }, { reload: true });
		})['catch'](function () {
			$scope.signupError = "I'm afraid we already have someone by that name";
		});
	};

	// Paralax effect for images
	$(function () {
		// Cache the window object (makes load time faster)
		var $window = $(window);
		// Parallax background effect
		$('section[data-type="background"]').each(function () {
			var $bgobj = $(this); // assigning the object
			$(window).scroll(function () {
				//scroll the background at var speed
				// the yPos is a negative because we're scrolling it up
				var yPos = -($window.scrollTop() / $bgobj.data('speed'));
				// Put together our final background position
				var coords = '50% ' + yPos + 'px';
				// Move the background
				$bgobj.css({ backgroundPosition: coords });
			}); // end window scroll
		});
	});
});
app.config(function ($stateProvider) {
	$stateProvider.state('editor', {
		url: '/editor/:id',
		templateUrl: 'js/quest-editor/editor.html',
		controller: 'EditorCtrl',
		resolve: {
			quest: function quest(QuestFactory, $stateParams) {
				return $stateParams.id !== "" ? QuestFactory.getOneQuest($stateParams.id) : undefined;
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('EditorCtrl', function ($scope, $stateParams, $uibModal, $state, $rootScope, quest, Session, QuestFactory, AuthService) {
	//variable saved to show/hide quest editor when editing individual states
	$rootScope.editorVisible = true;
	$scope.quest = quest;
	$scope.viewMainMap = true;
	$scope.newQuest = false;
	//if there is no quest, define one
	if (!quest) {
		$scope.newQuest = true;
		$scope.quest = {};
	}

	//update quest and go to dashboard for current user
	$scope.saveQuest = function () {
		// filter out all questSteps without targetCirlcles or transitionInfo.title
		if ($scope.quest.questSteps) {
			$scope.quest.questSteps = $scope.quest.questSteps.filter(function (step) {
				return step.targetCircle.center.length && step.transitionInfo.title;
			});
		}

		if (!$scope.newQuest) {
			return QuestFactory.save($scope.quest).then(function () {
				$state.go('dashboard', { userId: Session.user._id });
			});
		} else {
			return QuestFactory.saveNew($scope.quest).then(function () {
				$state.go('dashboard', { userId: Session.user._id });
			});
		}
	};
	//go to mapStates editor and hide Quest editor
	$scope.transitionToMapStateEditor = function () {
		if (!$scope.newQuest) {
			return QuestFactory.save($scope.quest).then(function () {
				if ($scope.quest.questSteps.length === 0) {
					$state.go('editor.questStep', { questStepId: null });
				} else {
					$state.go('editor.questStep', { questStepId: $scope.quest.questSteps[0]._id });
				}
				$scope.editorVisible = false;
			});
		} else {
			return QuestFactory.saveNew($scope.quest).then(function (savedQuest) {
				$scope.editorVisible = false;
				$state.go('editor.questStep', { id: savedQuest._id, questStepId: null });
			});
		}
	};

	$scope.logout = function () {
		AuthService.logout().then(function () {
			$state.go('home');
		});
	};

	//***********  MAP FUNCTIONS BELOW  ***********************
	var userLocation;
	var targetCircles = [];
	var circleCenters = [];
	var questMap = L.map('quest-map').setView([40.723008, -74.0006327], 13);
	questMap.scrollWheelZoom.disable(); // Really annoying when it happens accidently
	L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		maxZoom: 18,
		id: 'scotteggs.o7614jl2',
		accessToken: 'pk.eyJ1Ijoic2NvdHRlZ2dzIiwiYSI6ImNpaDZoZzhmdjBjMDZ1cWo5aGcyaXlteTkifQ.LZe0-IBRQmZ0PkQBsYIliw'
	}).addTo(questMap);

	// If there are no targetCircles yet created, set map view to user's location
	if (!$scope.quest.questSteps || !$scope.quest.questSteps[0] || !$scope.quest.questSteps[0].targetCircle) {

		questMap.locate().on('locationfound', function (e) {
			userLocation = [e.latitude, e.longitude];
			questMap.setView(userLocation, 14);
		});
	}

	// Redraw all targetCircles for the quest on the map and reset the bounds
	function drawCircles() {
		// Remove all circles
		targetCircles.forEach(function (circle) {
			questMap.removeLayer(circle);
		});
		// Draw a circle for every targetCircle in the quest
		if ($scope.quest.questSteps) {
			$scope.quest.questSteps.forEach(function (step, index) {
				if (step.targetCircle && step.targetCircle.center.length) {
					var center = step.targetCircle.center;
					var radius = step.targetCircle.radius;
					var circle = L.circle(center, radius);
					circle.bindLabel((index + 1).toString(), { noHide: true }).addTo(questMap);
					targetCircles.push(circle);
					circleCenters.push(step.targetCircle.center);
				}
			});
			if (circleCenters.length) questMap.fitBounds(circleCenters);
		}
	}
	drawCircles();
});

app.config(function ($stateProvider) {
	$stateProvider.state('dashboard', {
		url: '/dashboard/:userId',
		templateUrl: 'js/user-dashboard/dashboard.html',
		controller: 'DashCtrl',
		resolve: {
			userQuests: function userQuests(QuestFactory, $stateParams) {
				return QuestFactory.getUserQuests($stateParams.userId);
			}
		},
		data: {
			authenticate: true
		}
	});
});

app.controller('DashCtrl', function ($state, $scope, userQuests, Session, QuestFactory) {
	$scope.quests = [];
	$scope.quests = userQuests.map(function (g) {
		g.showDetail = false;
		return g;
	});

	$scope.goToEditor = function (questClicked) {
		$state.go('editor', { id: questClicked._id }, { reload: true });
	};
	$scope.deleteQuest = function (questClicked) {
		return QuestFactory['delete'](questClicked).then(function (deletedQuest) {
			$state.go('dashboard', { userId: Session.user._id }, { reload: true });
		});
	};
	$scope.parentClick = function (index) {
		var quest = $scope.quests[index];
		quest.showDetail = !quest.showDetail;
	};
	$scope.switchActive = function (questClicked) {
		QuestFactory.save(questClicked);
	};
});

app.factory('QuestFactory', function ($http, Session) {

	return {

		getAllQuests: function getAllQuests() {
			return $http.get('/api/quests').then(function (res) {
				return res.data;
			});
		},
		getOneQuest: function getOneQuest(questId) {
			return $http.get('/api/quests/' + questId).then(function (res) {
				return res.data;
			});
		},
		getUserQuests: function getUserQuests(userId) {
			return $http.get('/api/quests/userquests/' + userId).then(function (res) {
				return res.data;
			});
		},
		save: function save(quest) {
			return $http.put('/api/quests/' + quest._id, quest).then(function (res) {
				return res.data;
			});
		},
		saveNew: function saveNew(quest) {
			quest.author = Session.user._id;
			return $http.post('/api/quests/', quest).then(function (res) {
				return res.data;
			});
		},
		'delete': function _delete(quest) {
			return $http['delete']('/api/quests/' + quest._id);
		}
	};
});

app.directive('blueHeader', function (AuthService, $state) {

	return {
		restrict: 'E',
		scope: {
			head: '@',
			small: '@'
		},
		templateUrl: 'js/common/directives/blue-header/blue-header.html',
		link: function link(scope) {

			scope.user = null;

			var setUser = function setUser() {
				AuthService.getLoggedInUser().then(function (user) {
					scope.user = user;
				});
			};

			setUser();

			scope.logout = function () {
				AuthService.logout().then(function () {
					$state.go('home');
				});
			};
		}
	};
});
app.directive('fullstackLogo', function () {
	return {
		restrict: 'E',
		templateUrl: 'js/common/directives/fullstack-logo/fullstack-logo.html'
	};
});
app.directive('resolveLoader', function ($rootScope, $timeout) {

	return {
		restrict: 'E',
		replace: true,
		template: '<div class="alert alert-success ng-hide"><strong>Loading up!</strong></div>',
		link: function link(scope, element) {
			$rootScope.$on('$stateChangeStart', function (event, currentRoute, previousRoute) {

				$timeout(function () {
					element.removeClass('ng-hide');
				});
			});

			$rootScope.$on('$stateChangeSuccess', function () {
				element.addClass('ng-hide');
			});
		}
	};
});
app.directive('navbar', function ($rootScope, AuthService, AUTH_EVENTS, $state) {

	return {
		restrict: 'E',
		scope: {
			home: '=',
			dashboard: '='
		},
		templateUrl: 'js/common/directives/navbar/navbar.html',
		link: function link(scope) {

			scope.items = [{ label: 'Dashboard', state: 'home', auth: true }, { label: 'New Quest', state: 'editor', auth: true }];

			scope.user = null;

			scope.isLoggedIn = function () {
				return AuthService.isAuthenticated();
			};

			var setUser = function setUser() {
				AuthService.getLoggedInUser().then(function (user) {
					scope.user = user;
				});
			};

			var removeUser = function removeUser() {
				scope.user = null;
			};

			setUser();

			$rootScope.$on(AUTH_EVENTS.loginSuccess, setUser);
			$rootScope.$on(AUTH_EVENTS.logoutSuccess, removeUser);
			$rootScope.$on(AUTH_EVENTS.sessionTimeout, removeUser);

			// Pretty Scrolling Navbar Effect
			$(window).scroll(function () {
				if ($('.navbar').offset().top > 50 && scope.home) {
					$('.navbar-fixed-top').addClass('top-nav-collapse');
				} else if (scope.home) {
					$('.navbar-fixed-top').removeClass('top-nav-collapse');
				}
			});

			// Animated Scroll To Section
			$(function () {
				$('.page-scroll a').bind('click', function () {
					var $anchor = $(this);
					$('html, body').stop().animate({
						scrollTop: $($anchor.attr('href')).offset().top
					}, 1500, 'easeInOutExpo');
					event.preventDefault();
				});
			});
		}

	};
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImFwcC5qcyIsImZzYS9mc2EtcHJlLWJ1aWx0LmpzIiwicXVlc3Qtc3RlcC1lZGl0b3IvcXVlc3Qtc3RlcC1lZGl0b3IuanMiLCJob21lL2hvbWUuanMiLCJxdWVzdC1lZGl0b3IvZWRpdG9yLmpzIiwidXNlci1kYXNoYm9hcmQvZGFzaGJvYXJkLmpzIiwiY29tbW9uL2ZhY3Rvcmllcy9xdWVzdEZhY3RvcnkuanMiLCJjb21tb24vZGlyZWN0aXZlcy9ibHVlLWhlYWRlci9ibHVlLWhlYWRlci5qcyIsImNvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbG9hZGluZy9sb2FkaW5nLmpzIiwiY29tbW9uL2RpcmVjdGl2ZXMvbmF2YmFyL25hdmJhci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxFQUFBLENBQUEsYUFBQSxFQUFBLFdBQUEsRUFBQSxhQUFBLEVBQUEsY0FBQSxFQUFBLFdBQUEsRUFBQSxtQkFBQSxDQUFBLENBQUEsQ0FBQTs7QUFFQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsa0JBQUEsRUFBQSxpQkFBQSxFQUFBOztBQUVBLGtCQUFBLENBQUEsU0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBOztBQUVBLG1CQUFBLENBQUEsU0FBQSxDQUFBLFlBQUEsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOzs7QUFHQSxHQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7OztBQUdBLEtBQUEsNEJBQUEsR0FBQSxTQUFBLDRCQUFBLENBQUEsS0FBQSxFQUFBO0FBQ0EsU0FBQSxLQUFBLENBQUEsSUFBQSxJQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBO0VBQ0EsQ0FBQTs7OztBQUlBLFdBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxPQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLE1BQUEsQ0FBQSw0QkFBQSxDQUFBLE9BQUEsQ0FBQSxFQUFBOzs7QUFHQSxVQUFBO0dBQ0E7O0FBRUEsTUFBQSxXQUFBLENBQUEsZUFBQSxFQUFBLEVBQUE7OztBQUdBLFVBQUE7R0FDQTs7O0FBR0EsT0FBQSxDQUFBLGNBQUEsRUFBQSxDQUFBOztBQUVBLGFBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7Ozs7QUFJQSxPQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsRUFBQSxRQUFBLENBQUEsQ0FBQTtJQUNBLE1BQUE7QUFDQSxVQUFBLENBQUEsRUFBQSxDQUFBLE9BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7RUFFQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDbERBLENBQUEsWUFBQTs7QUFFQSxhQUFBLENBQUE7OztBQUdBLEtBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxFQUFBLE1BQUEsSUFBQSxLQUFBLENBQUEsd0JBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsR0FBQSxHQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsYUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsUUFBQSxFQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsRUFBQSxNQUFBLElBQUEsS0FBQSxDQUFBLHNCQUFBLENBQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOzs7OztBQUtBLElBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxFQUFBO0FBQ0EsY0FBQSxFQUFBLG9CQUFBO0FBQ0EsYUFBQSxFQUFBLG1CQUFBO0FBQ0EsZUFBQSxFQUFBLHFCQUFBO0FBQ0EsZ0JBQUEsRUFBQSxzQkFBQTtBQUNBLGtCQUFBLEVBQUEsd0JBQUE7QUFDQSxlQUFBLEVBQUEscUJBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsSUFBQSxDQUFBLE9BQUEsQ0FBQSxpQkFBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUE7QUFDQSxNQUFBLFVBQUEsR0FBQTtBQUNBLE1BQUEsRUFBQSxXQUFBLENBQUEsZ0JBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGFBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7QUFDQSxNQUFBLEVBQUEsV0FBQSxDQUFBLGNBQUE7R0FDQSxDQUFBO0FBQ0EsU0FBQTtBQUNBLGdCQUFBLEVBQUEsdUJBQUEsUUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLENBQUEsUUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLFFBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxhQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxDQUNBLFdBQUEsRUFDQSxVQUFBLFNBQUEsRUFBQTtBQUNBLFVBQUEsU0FBQSxDQUFBLEdBQUEsQ0FBQSxpQkFBQSxDQUFBLENBQUE7R0FDQSxDQUNBLENBQUEsQ0FBQTtFQUNBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxPQUFBLENBQUEsYUFBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLEVBQUEsRUFBQTs7QUFFQSxXQUFBLGlCQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsT0FBQSxJQUFBLEdBQUEsUUFBQSxDQUFBLElBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxNQUFBLENBQUEsSUFBQSxDQUFBLEVBQUEsRUFBQSxJQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtBQUNBLFVBQUEsSUFBQSxDQUFBLElBQUEsQ0FBQTtHQUNBOzs7O0FBSUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLGVBQUEsR0FBQSxVQUFBLFVBQUEsRUFBQTs7Ozs7Ozs7OztBQVVBLE9BQUEsSUFBQSxDQUFBLGVBQUEsRUFBQSxJQUFBLFVBQUEsS0FBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxDQUFBO0lBQ0E7Ozs7O0FBS0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FFQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxLQUFBLEdBQUEsVUFBQSxXQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFdBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxpQkFBQSxDQUFBLFNBQ0EsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLEVBQUEsT0FBQSxFQUFBLDRCQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFHQSxNQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsV0FBQSxFQUFBOztBQUVBLFVBQUEsS0FBQSxDQUFBLElBQUEsQ0FBQSxrQkFBQSxFQUFBLFdBQUEsQ0FBQTs7SUFFQSxJQUFBLENBQUEsVUFBQSxRQUFBLEVBQUE7O0FBRUEsV0FBQSxLQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FDQSxJQUFBLENBQUEsaUJBQUEsQ0FBQSxTQUNBLENBQUEsWUFBQTtBQUNBLFdBQUEsRUFBQSxDQUFBLE1BQUEsQ0FBQSxFQUFBLE9BQUEsRUFBQSw2QkFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxZQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsY0FBQSxDQUFBLFVBQUEsQ0FBQSxXQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBO0VBRUEsQ0FBQSxDQUFBOztBQUVBLElBQUEsQ0FBQSxPQUFBLENBQUEsU0FBQSxFQUFBLFVBQUEsVUFBQSxFQUFBLFdBQUEsRUFBQTs7QUFFQSxNQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsWUFBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLENBQUEsZ0JBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLFlBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsRUFBQSxZQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBOztBQUVBLE1BQUEsQ0FBQSxFQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsTUFBQSxDQUFBLE1BQUEsR0FBQSxVQUFBLFNBQUEsRUFBQSxJQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLFNBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTs7QUFFQSxNQUFBLENBQUEsT0FBQSxHQUFBLFlBQUE7QUFDQSxPQUFBLENBQUEsRUFBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0dBQ0EsQ0FBQTtFQUVBLENBQUEsQ0FBQTtDQUVBLENBQUEsRUFBQSxDQUFBOztBQ2xKQSxHQUFBLENBQUEsTUFBQSxDQUFBLFVBQUEsY0FBQSxFQUFBO0FBQ0EsZUFBQSxDQUFBLEtBQUEsQ0FBQSxrQkFBQSxFQUFBO0FBQ0EsS0FBQSxFQUFBLHlCQUFBO0FBQ0EsYUFBQSxFQUFBLDZDQUFBO0FBQ0EsWUFBQSxFQUFBLG1CQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsUUFBQSxFQUFBLGVBQUEsWUFBQSxFQUFBLFlBQUEsRUFBQTtBQUNBLFdBQUEsWUFBQSxDQUFBLEVBQUEsS0FBQSxFQUFBLEdBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsRUFBQSxDQUFBLEdBQ0EsU0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBR0EsR0FBQSxDQUFBLFVBQUEsQ0FBQSxtQkFBQSxFQUFBLFVBQUEsWUFBQSxFQUFBLE1BQUEsRUFBQSxNQUFBLEVBQUEsVUFBQSxFQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFdBQUEsQ0FBQSxhQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE9BQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxLQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxLQUFBLENBQUE7OztBQUdBLE9BQUEsQ0FBQSxPQUFBLEdBQUE7QUFDQSxNQUFBLEVBQUEsVUFBQTtBQUNBLGNBQUEsRUFBQTtBQUNBLFNBQUEsRUFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLElBQUE7R0FDQTtFQUNBLENBQUE7O0FBRUEsS0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsT0FBQSxDQUFBLFVBQUEsSUFBQSxFQUFBLEtBQUEsRUFBQTtBQUNBLE9BQUEsSUFBQSxDQUFBLEdBQUEsS0FBQSxZQUFBLENBQUEsV0FBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEtBQUEsQ0FBQSxHQUFBLEdBQUEsS0FBQSxDQUFBO0lBQ0E7R0FDQSxDQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFdBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsV0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBO0VBQ0E7O0FBRUEsT0FBQSxDQUFBLFVBQUEsR0FBQSxVQUFBLFdBQUEsRUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxLQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTs7QUFFQSxVQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsV0FBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxNQUFBLEVBQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsY0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLENBQUEsS0FBQSxFQUFBLFVBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtHQUNBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxjQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsRUFBQTs7QUFFQSxlQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsUUFBQSxFQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUEsVUFBQSxDQUFBLGFBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxZQUFBLEdBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxTQUFBLFlBQUEsQ0FBQSxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLFlBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLEdBQUEsWUFBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxrQkFBQSxFQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBRUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxlQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxFQUFBLENBQUEsQ0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEtBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsTUFBQSxFQUFBLEtBQUEsRUFBQSxDQUFBO0FBQ0EsU0FBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxHQUFBLFlBQUEsQ0FBQTtBQUNBLE9BQUEsZUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEdBQUEsSUFBQSxHQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUFBLEdBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLFdBQUEsRUFBQSxlQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7QUFFQSxVQUFBLFVBQUEsQ0FBQSxTQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsWUFBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsU0FBQSxDQUFBLEdBQUEsS0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0dBQ0EsRUFBQSxJQUFBLENBQUEsQ0FBQTtFQUNBOzs7OztBQU1BLEtBQUEsWUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsZ0JBQUEsQ0FBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLGVBQUEsQ0FBQSxPQUFBLEVBQUEsQ0FBQTs7QUFFQSxFQUFBLENBQUEsU0FBQSxDQUFBLGlGQUFBLEVBQUE7QUFDQSxTQUFBLEVBQUEsRUFBQTtBQUNBLElBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSw4RkFBQTtFQUNBLENBQUEsQ0FBQSxLQUFBLENBQUEsWUFBQSxDQUFBLENBQUE7Ozs7O0FBS0EsS0FBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxFQUFBLEVBQUEsQ0FBQSxDQUFBO0VBQ0EsTUFBQSxJQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxLQUFBLENBQUEsRUFBQTtBQUNBLGNBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLE1BQUE7QUFDQSxjQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsRUFBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTtBQUNBLGVBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0FBQ0EsZUFBQSxDQUFBLE9BQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQTs7O0FBR0EsS0FBQSxVQUFBLEdBQUEsSUFBQSxDQUFBLENBQUEsWUFBQSxFQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsUUFBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLFdBQUEsR0FBQSxJQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBO0FBQ0EsTUFBQSxFQUFBO0FBQ0EsV0FBQSxFQUFBLEtBQUE7QUFDQSxVQUFBLEVBQUEsS0FBQTtBQUNBLFlBQUEsRUFBQSxLQUFBO0FBQ0EsU0FBQSxFQUFBLEtBQUE7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxVQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsVUFBQSxDQUFBLFdBQUEsQ0FBQSxDQUFBOztBQUVBLEtBQUEsTUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxNQUFBLGFBQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsRUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7RUFDQTtBQUNBLEtBQUEsTUFBQSxDQUFBO0FBQ0EsYUFBQSxDQUFBLEVBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLEVBQUE7O0FBRUEsTUFBQSxhQUFBLEVBQUEsWUFBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FBQTtBQUNBLE1BQUEsTUFBQSxFQUFBLFlBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLElBQUEsR0FBQSxDQUFBLENBQUEsU0FBQSxDQUFBO0FBQ0EsTUFBQSxLQUFBLEdBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQTs7QUFFQSxRQUFBLENBQUEsV0FBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLEdBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxHQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUE7O0FBRUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsRUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLEdBQUEsQ0FBQSxFQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGNBQUEsQ0FBQSxRQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLGtCQUFBLEdBQUEsWUFBQTtBQUNBLE1BQUEsTUFBQSxDQUFBLFdBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsSUFBQSxNQUFBLENBQUEsV0FBQSxDQUFBLGNBQUEsQ0FBQSxRQUFBLEVBQUEsT0FBQSxTQUFBLENBQUE7QUFDQSxTQUFBLFNBQUEsQ0FBQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDeEtBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7O0FBRUEsZUFBQSxDQUFBLEtBQUEsQ0FBQSxNQUFBLEVBQUE7QUFDQSxLQUFBLEVBQUEsR0FBQTtBQUNBLGFBQUEsRUFBQSxtQkFBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsZ0JBQUEsRUFBQSx1QkFBQSxXQUFBLEVBQUE7QUFDQSxXQUFBLFdBQUEsQ0FBQSxlQUFBLEVBQUEsQ0FBQTtJQUNBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQSxhQUFBLEVBQUE7O0FBRUEsS0FBQSxhQUFBLEVBQUEsTUFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsYUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7O0FBRUEsT0FBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsRUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFVBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLElBQUEsQ0FBQTs7QUFFQSxPQUFBLENBQUEsU0FBQSxHQUFBLFVBQUEsU0FBQSxFQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsRUFBQSxTQUFBLENBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxLQUFBLENBQUEsU0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEdBQUEsQ0FBQSxxQkFBQSxFQUFBLElBQUEsQ0FBQSxDQUFBO0FBQ0EsU0FBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLFNBQUEsQ0FBQSxZQUFBO0FBQ0EsU0FBQSxDQUFBLFVBQUEsR0FBQSxnREFBQSxDQUFBO0dBQ0EsQ0FBQSxDQUFBO0VBQ0EsQ0FBQTs7QUFFQSxPQUFBLENBQUEsVUFBQSxHQUFBLFVBQUEsVUFBQSxFQUFBO0FBQ0EsU0FBQSxDQUFBLEdBQUEsQ0FBQSxXQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7QUFDQSxRQUFBLENBQUEsS0FBQSxHQUFBLElBQUEsQ0FBQTtBQUNBLGFBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLEdBQUEsQ0FBQSxlQUFBLEVBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtHQUNBLENBQUEsU0FBQSxDQUFBLFlBQUE7QUFDQSxTQUFBLENBQUEsV0FBQSxHQUFBLGlEQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBOzs7QUFHQSxFQUFBLENBQUEsWUFBQTs7QUFFQSxNQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLGlDQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLE9BQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsQ0FBQTtBQUNBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsWUFBQTs7O0FBR0EsUUFBQSxJQUFBLEdBQUEsRUFBQSxPQUFBLENBQUEsU0FBQSxFQUFBLEdBQUEsTUFBQSxDQUFBLElBQUEsQ0FBQSxPQUFBLENBQUEsQ0FBQSxDQUFBOztBQUVBLFFBQUEsTUFBQSxHQUFBLE1BQUEsR0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBOztBQUVBLFVBQUEsQ0FBQSxHQUFBLENBQUEsRUFBQSxrQkFBQSxFQUFBLE1BQUEsRUFBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBLENBQUE7Q0FJQSxDQUFBLENBQUE7QUNwRUEsR0FBQSxDQUFBLE1BQUEsQ0FBQSxVQUFBLGNBQUEsRUFBQTtBQUNBLGVBQUEsQ0FBQSxLQUFBLENBQUEsUUFBQSxFQUNBO0FBQ0EsS0FBQSxFQUFBLGFBQUE7QUFDQSxhQUFBLEVBQUEsNkJBQUE7QUFDQSxZQUFBLEVBQUEsWUFBQTtBQUNBLFNBQUEsRUFBQTtBQUNBLFFBQUEsRUFBQSxlQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxFQUFBLEtBQUEsRUFBQSxHQUNBLFlBQUEsQ0FBQSxXQUFBLENBQUEsWUFBQSxDQUFBLEVBQUEsQ0FBQSxHQUNBLFNBQUEsQ0FBQTtJQUNBO0dBQ0E7QUFDQSxNQUFBLEVBQUE7QUFDQSxlQUFBLEVBQUEsSUFBQTtHQUNBO0VBQ0EsQ0FBQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBOztBQUVBLEdBQUEsQ0FBQSxVQUFBLENBQUEsWUFBQSxFQUFBLFVBQUEsTUFBQSxFQUFBLFlBQUEsRUFBQSxTQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxLQUFBLEVBQUEsT0FBQSxFQUFBLFlBQUEsRUFBQSxXQUFBLEVBQUE7O0FBRUEsV0FBQSxDQUFBLGFBQUEsR0FBQSxJQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsS0FBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLE9BQUEsQ0FBQSxXQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFFBQUEsR0FBQSxLQUFBLENBQUE7O0FBRUEsS0FBQSxDQUFBLEtBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxRQUFBLEdBQUEsSUFBQSxDQUFBO0FBQ0EsUUFBQSxDQUFBLEtBQUEsR0FBQSxFQUFBLENBQUE7RUFDQTs7O0FBR0EsT0FBQSxDQUFBLFNBQUEsR0FBQSxZQUFBOztBQUVBLE1BQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsR0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxJQUFBLEVBQUE7QUFDQSxXQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsTUFBQSxDQUFBLE1BQUEsSUFBQSxJQUFBLENBQUEsY0FBQSxDQUFBLEtBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBOztBQUVBLE1BQUEsQ0FBQSxNQUFBLENBQUEsUUFBQSxFQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsV0FBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLE9BQUEsQ0FBQSxJQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBLE1BQUE7QUFDQSxVQUFBLFlBQUEsQ0FBQSxPQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsVUFBQSxDQUFBLEVBQUEsQ0FBQSxXQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSwwQkFBQSxHQUFBLFlBQUE7QUFDQSxNQUFBLENBQUEsTUFBQSxDQUFBLFFBQUEsRUFBQTtBQUNBLFVBQUEsWUFBQSxDQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQ0EsSUFBQSxDQUFBLFlBQUE7QUFDQSxRQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE1BQUEsS0FBQSxDQUFBLEVBQUE7QUFDQSxXQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUE7QUFDQSxXQUFBLENBQUEsRUFBQSxDQUFBLGtCQUFBLEVBQUEsRUFBQSxXQUFBLEVBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLENBQUEsQ0FBQSxDQUFBLENBQUEsR0FBQSxFQUFBLENBQUEsQ0FBQTtLQUNBO0FBQ0EsVUFBQSxDQUFBLGFBQUEsR0FBQSxLQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQSxNQUFBO0FBQ0EsVUFBQSxZQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxVQUFBLEVBQUE7QUFDQSxVQUFBLENBQUEsYUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFVBQUEsQ0FBQSxFQUFBLENBQUEsa0JBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxVQUFBLENBQUEsR0FBQSxFQUFBLFdBQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBQ0E7RUFDQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLGFBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FBQSxJQUFBLENBQUEsWUFBQTtBQUNBLFNBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBOzs7QUFHQSxLQUFBLFlBQUEsQ0FBQTtBQUNBLEtBQUEsYUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLEtBQUEsYUFBQSxHQUFBLEVBQUEsQ0FBQTtBQUNBLEtBQUEsUUFBQSxHQUFBLENBQUEsQ0FBQSxHQUFBLENBQUEsV0FBQSxDQUFBLENBQUEsT0FBQSxDQUFBLENBQUEsU0FBQSxFQUFBLENBQUEsVUFBQSxDQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7QUFDQSxTQUFBLENBQUEsZUFBQSxDQUFBLE9BQUEsRUFBQSxDQUFBO0FBQ0EsRUFBQSxDQUFBLFNBQUEsQ0FBQSxpRkFBQSxFQUFBO0FBQ0EsU0FBQSxFQUFBLEVBQUE7QUFDQSxJQUFBLEVBQUEsb0JBQUE7QUFDQSxhQUFBLEVBQUEsOEZBQUE7RUFDQSxDQUFBLENBQUEsS0FBQSxDQUFBLFFBQUEsQ0FBQSxDQUFBOzs7QUFHQSxLQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsQ0FBQSxVQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLENBQUEsQ0FBQSxDQUFBLFlBQUEsRUFBQTs7QUFFQSxVQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsRUFBQSxDQUFBLGVBQUEsRUFBQSxVQUFBLENBQUEsRUFBQTtBQUNBLGVBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLE9BQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQTs7O0FBR0EsVUFBQSxXQUFBLEdBQUE7O0FBRUEsZUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLE1BQUEsRUFBQTtBQUNBLFdBQUEsQ0FBQSxXQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7O0FBRUEsTUFBQSxNQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsRUFBQTtBQUNBLFNBQUEsQ0FBQSxLQUFBLENBQUEsVUFBQSxDQUFBLE9BQUEsQ0FBQSxVQUFBLElBQUEsRUFBQSxLQUFBLEVBQUE7QUFDQSxRQUFBLElBQUEsQ0FBQSxZQUFBLElBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBO0FBQ0EsU0FBQSxNQUFBLEdBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUE7QUFDQSxTQUFBLE1BQUEsR0FBQSxJQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQTtBQUNBLFNBQUEsTUFBQSxHQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsTUFBQSxFQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0EsV0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLEtBQUEsR0FBQSxDQUFBLENBQUEsQ0FBQSxRQUFBLEVBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsQ0FBQSxDQUFBLEtBQUEsQ0FBQSxRQUFBLENBQUEsQ0FBQTtBQUNBLGtCQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0FBQ0Esa0JBQUEsQ0FBQSxJQUFBLENBQUEsSUFBQSxDQUFBLFlBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQTtLQUNBO0lBQ0EsQ0FBQSxDQUFBO0FBQ0EsT0FBQSxhQUFBLENBQUEsTUFBQSxFQUFBLFFBQUEsQ0FBQSxTQUFBLENBQUEsYUFBQSxDQUFBLENBQUE7R0FDQTtFQUNBO0FBQ0EsWUFBQSxFQUFBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDM0hBLEdBQUEsQ0FBQSxNQUFBLENBQUEsVUFBQSxjQUFBLEVBQUE7QUFDQSxlQUFBLENBQUEsS0FBQSxDQUFBLFdBQUEsRUFBQTtBQUNBLEtBQUEsRUFBQSxvQkFBQTtBQUNBLGFBQUEsRUFBQSxrQ0FBQTtBQUNBLFlBQUEsRUFBQSxVQUFBO0FBQ0EsU0FBQSxFQUFBO0FBQ0EsYUFBQSxFQUFBLG9CQUFBLFlBQUEsRUFBQSxZQUFBLEVBQUE7QUFDQSxXQUFBLFlBQUEsQ0FBQSxhQUFBLENBQUEsWUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBO0lBQ0E7R0FDQTtBQUNBLE1BQUEsRUFBQTtBQUNBLGVBQUEsRUFBQSxJQUFBO0dBQ0E7RUFDQSxDQUFBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FBRUEsR0FBQSxDQUFBLFVBQUEsQ0FBQSxVQUFBLEVBQUEsVUFBQSxNQUFBLEVBQUEsTUFBQSxFQUFBLFVBQUEsRUFBQSxPQUFBLEVBQUEsWUFBQSxFQUFBO0FBQ0EsT0FBQSxDQUFBLE1BQUEsR0FBQSxFQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsTUFBQSxHQUFBLFVBQUEsQ0FBQSxHQUFBLENBQUEsVUFBQSxDQUFBLEVBQUE7QUFDQSxHQUFBLENBQUEsVUFBQSxHQUFBLEtBQUEsQ0FBQTtBQUNBLFNBQUEsQ0FBQSxDQUFBO0VBQ0EsQ0FBQSxDQUFBOztBQUVBLE9BQUEsQ0FBQSxVQUFBLEdBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxRQUFBLENBQUEsRUFBQSxDQUFBLFFBQUEsRUFBQSxFQUFBLEVBQUEsRUFBQSxZQUFBLENBQUEsR0FBQSxFQUFBLEVBQUEsRUFBQSxNQUFBLEVBQUEsSUFBQSxFQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsV0FBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsU0FBQSxZQUFBLFVBQUEsQ0FBQSxZQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxZQUFBLEVBQUE7QUFDQSxTQUFBLENBQUEsRUFBQSxDQUFBLFdBQUEsRUFBQSxFQUFBLE1BQUEsRUFBQSxPQUFBLENBQUEsSUFBQSxDQUFBLEdBQUEsRUFBQSxFQUFBLEVBQUEsTUFBQSxFQUFBLElBQUEsRUFBQSxDQUFBLENBQUE7R0FDQSxDQUFBLENBQUE7RUFDQSxDQUFBO0FBQ0EsT0FBQSxDQUFBLFdBQUEsR0FBQSxVQUFBLEtBQUEsRUFBQTtBQUNBLE1BQUEsS0FBQSxHQUFBLE1BQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxDQUFBLENBQUE7QUFDQSxPQUFBLENBQUEsVUFBQSxHQUFBLENBQUEsS0FBQSxDQUFBLFVBQUEsQ0FBQTtFQUNBLENBQUE7QUFDQSxPQUFBLENBQUEsWUFBQSxHQUFBLFVBQUEsWUFBQSxFQUFBO0FBQ0EsY0FBQSxDQUFBLElBQUEsQ0FBQSxZQUFBLENBQUEsQ0FBQTtFQUNBLENBQUE7Q0FFQSxDQUFBLENBQUE7O0FDeENBLEdBQUEsQ0FBQSxPQUFBLENBQUEsY0FBQSxFQUFBLFVBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTs7QUFFQSxRQUFBOztBQUVBLGNBQUEsRUFBQSx3QkFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSxhQUFBLENBQUEsQ0FDQSxJQUFBLENBQUEsVUFBQSxHQUFBLEVBQUE7QUFDQSxXQUFBLEdBQUEsQ0FBQSxJQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtBQUNBLGFBQUEsRUFBQSxxQkFBQSxPQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxHQUFBLENBQUEsY0FBQSxHQUFBLE9BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsZUFBQSxFQUFBLHVCQUFBLE1BQUEsRUFBQTtBQUNBLFVBQUEsS0FBQSxDQUFBLEdBQUEsQ0FBQSx5QkFBQSxHQUFBLE1BQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBO0FBQ0EsVUFBQSxLQUFBLENBQUEsR0FBQSxDQUFBLGNBQUEsR0FBQSxLQUFBLENBQUEsR0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsU0FBQSxFQUFBLGlCQUFBLEtBQUEsRUFBQTtBQUNBLFFBQUEsQ0FBQSxNQUFBLEdBQUEsT0FBQSxDQUFBLElBQUEsQ0FBQSxHQUFBLENBQUE7QUFDQSxVQUFBLEtBQUEsQ0FBQSxJQUFBLENBQUEsY0FBQSxFQUFBLEtBQUEsQ0FBQSxDQUNBLElBQUEsQ0FBQSxVQUFBLEdBQUEsRUFBQTtBQUNBLFdBQUEsR0FBQSxDQUFBLElBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTtHQUNBO0FBQ0EsWUFBQSxpQkFBQSxLQUFBLEVBQUE7QUFDQSxVQUFBLEtBQUEsVUFBQSxDQUFBLGNBQUEsR0FBQSxLQUFBLENBQUEsR0FBQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7O0FDdkNBLEdBQUEsQ0FBQSxTQUFBLENBQUEsWUFBQSxFQUFBLFVBQUEsV0FBQSxFQUFBLE1BQUEsRUFBQTs7QUFFQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxPQUFBLEVBQUE7QUFDQSxPQUFBLEVBQUEsR0FBQTtBQUNBLFFBQUEsRUFBQSxHQUFBO0dBQ0E7QUFDQSxhQUFBLEVBQUEsbURBQUE7QUFDQSxNQUFBLEVBQUEsY0FBQSxLQUFBLEVBQUE7O0FBRUEsUUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsT0FBQSxPQUFBLEdBQUEsU0FBQSxPQUFBLEdBQUE7QUFDQSxlQUFBLENBQUEsZUFBQSxFQUFBLENBQUEsSUFBQSxDQUFBLFVBQUEsSUFBQSxFQUFBO0FBQ0EsVUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLFVBQUEsRUFBQSxDQUFBOztBQUVBLFFBQUEsQ0FBQSxNQUFBLEdBQUEsWUFBQTtBQUNBLGVBQUEsQ0FBQSxNQUFBLEVBQUEsQ0FDQSxJQUFBLENBQUEsWUFBQTtBQUNBLFdBQUEsQ0FBQSxFQUFBLENBQUEsTUFBQSxDQUFBLENBQUE7S0FDQSxDQUFBLENBQUE7SUFDQSxDQUFBO0dBRUE7RUFDQSxDQUFBO0NBRUEsQ0FBQSxDQUFBO0FDL0JBLEdBQUEsQ0FBQSxTQUFBLENBQUEsZUFBQSxFQUFBLFlBQUE7QUFDQSxRQUFBO0FBQ0EsVUFBQSxFQUFBLEdBQUE7QUFDQSxhQUFBLEVBQUEseURBQUE7RUFDQSxDQUFBO0NBQ0EsQ0FBQSxDQUFBO0FDTEEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxlQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsUUFBQSxFQUFBOztBQUVBLFFBQUE7QUFDQSxVQUFBLEVBQUEsR0FBQTtBQUNBLFNBQUEsRUFBQSxJQUFBO0FBQ0EsVUFBQSxFQUFBLDZFQUFBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBLE9BQUEsRUFBQTtBQUNBLGFBQUEsQ0FBQSxHQUFBLENBQUEsbUJBQUEsRUFBQSxVQUFBLEtBQUEsRUFBQSxZQUFBLEVBQUEsYUFBQSxFQUFBOztBQUVBLFlBQUEsQ0FBQSxZQUFBO0FBQ0EsWUFBQSxDQUFBLFdBQUEsQ0FBQSxTQUFBLENBQUEsQ0FBQTtLQUNBLENBQUEsQ0FBQTtJQUNBLENBQUEsQ0FBQTs7QUFFQSxhQUFBLENBQUEsR0FBQSxDQUFBLHFCQUFBLEVBQUEsWUFBQTtBQUNBLFdBQUEsQ0FBQSxRQUFBLENBQUEsU0FBQSxDQUFBLENBQUE7SUFDQSxDQUFBLENBQUE7R0FDQTtFQUNBLENBQUE7Q0FDQSxDQUFBLENBQUE7QUNuQkEsR0FBQSxDQUFBLFNBQUEsQ0FBQSxRQUFBLEVBQUEsVUFBQSxVQUFBLEVBQUEsV0FBQSxFQUFBLFdBQUEsRUFBQSxNQUFBLEVBQUE7O0FBRUEsUUFBQTtBQUNBLFVBQUEsRUFBQSxHQUFBO0FBQ0EsT0FBQSxFQUFBO0FBQ0EsT0FBQSxFQUFBLEdBQUE7QUFDQSxZQUFBLEVBQUEsR0FBQTtHQUNBO0FBQ0EsYUFBQSxFQUFBLHlDQUFBO0FBQ0EsTUFBQSxFQUFBLGNBQUEsS0FBQSxFQUFBOztBQUVBLFFBQUEsQ0FBQSxLQUFBLEdBQUEsQ0FDQSxFQUFBLEtBQUEsRUFBQSxXQUFBLEVBQUEsS0FBQSxFQUFBLE1BQUEsRUFBQSxJQUFBLEVBQUEsSUFBQSxFQUFBLEVBQ0EsRUFBQSxLQUFBLEVBQUEsV0FBQSxFQUFBLEtBQUEsRUFBQSxRQUFBLEVBQUEsSUFBQSxFQUFBLElBQUEsRUFBQSxDQUNBLENBQUE7O0FBRUEsUUFBQSxDQUFBLElBQUEsR0FBQSxJQUFBLENBQUE7O0FBRUEsUUFBQSxDQUFBLFVBQUEsR0FBQSxZQUFBO0FBQ0EsV0FBQSxXQUFBLENBQUEsZUFBQSxFQUFBLENBQUE7SUFDQSxDQUFBOztBQUVBLE9BQUEsT0FBQSxHQUFBLFNBQUEsT0FBQSxHQUFBO0FBQ0EsZUFBQSxDQUFBLGVBQUEsRUFBQSxDQUFBLElBQUEsQ0FBQSxVQUFBLElBQUEsRUFBQTtBQUNBLFVBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxPQUFBLFVBQUEsR0FBQSxTQUFBLFVBQUEsR0FBQTtBQUNBLFNBQUEsQ0FBQSxJQUFBLEdBQUEsSUFBQSxDQUFBO0lBQ0EsQ0FBQTs7QUFFQSxVQUFBLEVBQUEsQ0FBQTs7QUFFQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxZQUFBLEVBQUEsT0FBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxhQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7QUFDQSxhQUFBLENBQUEsR0FBQSxDQUFBLFdBQUEsQ0FBQSxjQUFBLEVBQUEsVUFBQSxDQUFBLENBQUE7OztBQUdBLElBQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxNQUFBLENBQUEsWUFBQTtBQUNBLFFBQUEsQ0FBQSxDQUFBLFNBQUEsQ0FBQSxDQUFBLE1BQUEsRUFBQSxDQUFBLEdBQUEsR0FBQSxFQUFBLElBQUEsS0FBQSxDQUFBLElBQUEsRUFBQTtBQUNBLE1BQUEsQ0FBQSxtQkFBQSxDQUFBLENBQUEsUUFBQSxDQUFBLGtCQUFBLENBQUEsQ0FBQTtLQUNBLE1BQUEsSUFBQSxLQUFBLENBQUEsSUFBQSxFQUFBO0FBQ0EsTUFBQSxDQUFBLG1CQUFBLENBQUEsQ0FBQSxXQUFBLENBQUEsa0JBQUEsQ0FBQSxDQUFBO0tBQ0E7SUFDQSxDQUFBLENBQUE7OztBQUdBLElBQUEsQ0FBQSxZQUFBO0FBQ0EsS0FBQSxDQUFBLGdCQUFBLENBQUEsQ0FBQSxJQUFBLENBQUEsT0FBQSxFQUFBLFlBQUE7QUFDQSxTQUFBLE9BQUEsR0FBQSxDQUFBLENBQUEsSUFBQSxDQUFBLENBQUE7QUFDQSxNQUFBLENBQUEsWUFBQSxDQUFBLENBQUEsSUFBQSxFQUFBLENBQUEsT0FBQSxDQUFBO0FBQ0EsZUFBQSxFQUFBLENBQUEsQ0FBQSxPQUFBLENBQUEsSUFBQSxDQUFBLE1BQUEsQ0FBQSxDQUFBLENBQUEsTUFBQSxFQUFBLENBQUEsR0FBQTtNQUNBLEVBQUEsSUFBQSxFQUFBLGVBQUEsQ0FBQSxDQUFBO0FBQ0EsVUFBQSxDQUFBLGNBQUEsRUFBQSxDQUFBO0tBQ0EsQ0FBQSxDQUFBO0lBQ0EsQ0FBQSxDQUFBO0dBRUE7O0VBRUEsQ0FBQTtDQUVBLENBQUEsQ0FBQSIsImZpbGUiOiJtYWluLmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xud2luZG93LmFwcCA9IGFuZ3VsYXIubW9kdWxlKCdHZW9RdWVzdCcsIFsnZnNhUHJlQnVpbHQnLCAndWkucm91dGVyJywgJ3VpLnNvcnRhYmxlJywgJ3VpLmJvb3RzdHJhcCcsICduZ0FuaW1hdGUnLCAnbGVhZmxldC1kaXJlY3RpdmUnXSk7XG5cbmFwcC5jb25maWcoZnVuY3Rpb24gKCR1cmxSb3V0ZXJQcm92aWRlciwgJGxvY2F0aW9uUHJvdmlkZXIpIHtcbiAgICAvLyBUaGlzIHR1cm5zIG9mZiBoYXNoYmFuZyB1cmxzICgvI2Fib3V0KSBhbmQgY2hhbmdlcyBpdCB0byBzb21ldGhpbmcgbm9ybWFsICgvYWJvdXQpXG4gICAgJGxvY2F0aW9uUHJvdmlkZXIuaHRtbDVNb2RlKHRydWUpO1xuICAgIC8vIElmIHdlIGdvIHRvIGEgVVJMIHRoYXQgdWktcm91dGVyIGRvZXNuJ3QgaGF2ZSByZWdpc3RlcmVkLCBnbyB0byB0aGUgXCIvXCIgdXJsLlxuICAgICR1cmxSb3V0ZXJQcm92aWRlci5vdGhlcndpc2UoJy9kYXNoYm9hcmQnKTtcbn0pO1xuXG4vLyBUaGlzIGFwcC5ydW4gaXMgZm9yIGNvbnRyb2xsaW5nIGFjY2VzcyB0byBzcGVjaWZpYyBzdGF0ZXMuXG5hcHAucnVuKGZ1bmN0aW9uICgkcm9vdFNjb3BlLCBBdXRoU2VydmljZSwgJHN0YXRlKSB7XG5cbiAgICAvLyBUaGUgZ2l2ZW4gc3RhdGUgcmVxdWlyZXMgYW4gYXV0aGVudGljYXRlZCB1c2VyLlxuICAgIHZhciBkZXN0aW5hdGlvblN0YXRlUmVxdWlyZXNBdXRoID0gZnVuY3Rpb24gKHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kYXRhICYmIHN0YXRlLmRhdGEuYXV0aGVudGljYXRlO1xuICAgIH07XG5cbiAgICAvLyAkc3RhdGVDaGFuZ2VTdGFydCBpcyBhbiBldmVudCBmaXJlZFxuICAgIC8vIHdoZW5ldmVyIHRoZSBwcm9jZXNzIG9mIGNoYW5naW5nIGEgc3RhdGUgYmVnaW5zLlxuICAgICRyb290U2NvcGUuJG9uKCckc3RhdGVDaGFuZ2VTdGFydCcsIGZ1bmN0aW9uIChldmVudCwgdG9TdGF0ZSwgdG9QYXJhbXMpIHtcblxuICAgICAgICBpZiAoIWRlc3RpbmF0aW9uU3RhdGVSZXF1aXJlc0F1dGgodG9TdGF0ZSkpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZXN0aW5hdGlvbiBzdGF0ZSBkb2VzIG5vdCByZXF1aXJlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgICAgICAvLyBTaG9ydCBjaXJjdWl0IHdpdGggcmV0dXJuLlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpKSB7XG4gICAgICAgICAgICAvLyBUaGUgdXNlciBpcyBhdXRoZW50aWNhdGVkLlxuICAgICAgICAgICAgLy8gU2hvcnQgY2lyY3VpdCB3aXRoIHJldHVybi5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbmNlbCBuYXZpZ2F0aW5nIHRvIG5ldyBzdGF0ZS5cbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAvLyBJZiBhIHVzZXIgaXMgcmV0cmlldmVkLCB0aGVuIHJlbmF2aWdhdGUgdG8gdGhlIGRlc3RpbmF0aW9uXG4gICAgICAgICAgICAvLyAodGhlIHNlY29uZCB0aW1lLCBBdXRoU2VydmljZS5pc0F1dGhlbnRpY2F0ZWQoKSB3aWxsIHdvcmspXG4gICAgICAgICAgICAvLyBvdGhlcndpc2UsIGlmIG5vIHVzZXIgaXMgbG9nZ2VkIGluLCBnbyB0byBcImxvZ2luXCIgc3RhdGUuXG4gICAgICAgICAgICBpZiAodXNlcikge1xuICAgICAgICAgICAgICAgICRzdGF0ZS5nbyh0b1N0YXRlLm5hbWUsIHRvUGFyYW1zKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgJHN0YXRlLmdvKCdsb2dpbicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgIH0pO1xuXG59KTtcbiIsIihmdW5jdGlvbiAoKSB7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyBIb3BlIHlvdSBkaWRuJ3QgZm9yZ2V0IEFuZ3VsYXIhIER1aC1kb3kuXG4gICAgaWYgKCF3aW5kb3cuYW5ndWxhcikgdGhyb3cgbmV3IEVycm9yKCdJIGNhblxcJ3QgZmluZCBBbmd1bGFyIScpO1xuXG4gICAgdmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKCdmc2FQcmVCdWlsdCcsIFtdKTtcblxuICAgIGFwcC5mYWN0b3J5KCdTb2NrZXQnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghd2luZG93LmlvKSB0aHJvdyBuZXcgRXJyb3IoJ3NvY2tldC5pbyBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybiB3aW5kb3cuaW8od2luZG93LmxvY2F0aW9uLm9yaWdpbik7XG4gICAgfSk7XG5cbiAgICAvLyBBVVRIX0VWRU5UUyBpcyB1c2VkIHRocm91Z2hvdXQgb3VyIGFwcCB0b1xuICAgIC8vIGJyb2FkY2FzdCBhbmQgbGlzdGVuIGZyb20gYW5kIHRvIHRoZSAkcm9vdFNjb3BlXG4gICAgLy8gZm9yIGltcG9ydGFudCBldmVudHMgYWJvdXQgYXV0aGVudGljYXRpb24gZmxvdy5cbiAgICBhcHAuY29uc3RhbnQoJ0FVVEhfRVZFTlRTJywge1xuICAgICAgICBsb2dpblN1Y2Nlc3M6ICdhdXRoLWxvZ2luLXN1Y2Nlc3MnLFxuICAgICAgICBsb2dpbkZhaWxlZDogJ2F1dGgtbG9naW4tZmFpbGVkJyxcbiAgICAgICAgbG9nb3V0U3VjY2VzczogJ2F1dGgtbG9nb3V0LXN1Y2Nlc3MnLFxuICAgICAgICBzZXNzaW9uVGltZW91dDogJ2F1dGgtc2Vzc2lvbi10aW1lb3V0JyxcbiAgICAgICAgbm90QXV0aGVudGljYXRlZDogJ2F1dGgtbm90LWF1dGhlbnRpY2F0ZWQnLFxuICAgICAgICBub3RBdXRob3JpemVkOiAnYXV0aC1ub3QtYXV0aG9yaXplZCdcbiAgICB9KTtcblxuICAgIGFwcC5mYWN0b3J5KCdBdXRoSW50ZXJjZXB0b3InLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgJHEsIEFVVEhfRVZFTlRTKSB7XG4gICAgICAgIHZhciBzdGF0dXNEaWN0ID0ge1xuICAgICAgICAgICAgNDAxOiBBVVRIX0VWRU5UUy5ub3RBdXRoZW50aWNhdGVkLFxuICAgICAgICAgICAgNDAzOiBBVVRIX0VWRU5UUy5ub3RBdXRob3JpemVkLFxuICAgICAgICAgICAgNDE5OiBBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCxcbiAgICAgICAgICAgIDQ0MDogQVVUSF9FVkVOVFMuc2Vzc2lvblRpbWVvdXRcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChzdGF0dXNEaWN0W3Jlc3BvbnNlLnN0YXR1c10sIHJlc3BvbnNlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHJlc3BvbnNlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgYXBwLmNvbmZpZyhmdW5jdGlvbiAoJGh0dHBQcm92aWRlcikge1xuICAgICAgICAkaHR0cFByb3ZpZGVyLmludGVyY2VwdG9ycy5wdXNoKFtcbiAgICAgICAgICAgICckaW5qZWN0b3InLFxuICAgICAgICAgICAgZnVuY3Rpb24gKCRpbmplY3Rvcikge1xuICAgICAgICAgICAgICAgIHJldHVybiAkaW5qZWN0b3IuZ2V0KCdBdXRoSW50ZXJjZXB0b3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSk7XG4gICAgfSk7XG4gICAgYXBwLnNlcnZpY2UoJ0F1dGhTZXJ2aWNlJywgZnVuY3Rpb24gKCRodHRwLCBTZXNzaW9uLCAkcm9vdFNjb3BlLCBBVVRIX0VWRU5UUywgJHEpIHtcblxuICAgICAgICBmdW5jdGlvbiBvblN1Y2Nlc3NmdWxMb2dpbihyZXNwb25zZSkge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgICAgICAgICAgU2Vzc2lvbi5jcmVhdGUoZGF0YS5pZCwgZGF0YS51c2VyKTtcbiAgICAgICAgICAgICRyb290U2NvcGUuJGJyb2FkY2FzdChBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MpO1xuICAgICAgICAgICAgcmV0dXJuIGRhdGEudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVzZXMgdGhlIHNlc3Npb24gZmFjdG9yeSB0byBzZWUgaWYgYW5cbiAgICAgICAgLy8gYXV0aGVudGljYXRlZCB1c2VyIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLlxuICAgICAgICB0aGlzLmlzQXV0aGVudGljYXRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIVNlc3Npb24udXNlcjtcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLmdldExvZ2dlZEluVXNlciA9IGZ1bmN0aW9uIChmcm9tU2VydmVyKSB7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBleGlzdHMsIHdlXG4gICAgICAgICAgICAvLyByZXR1cm4gdGhlIHVzZXIgYXR0YWNoZWQgdG8gdGhhdCBzZXNzaW9uXG4gICAgICAgICAgICAvLyB3aXRoIGEgcHJvbWlzZS4gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuXG4gICAgICAgICAgICAvLyBhbHdheXMgaW50ZXJmYWNlIHdpdGggdGhpcyBtZXRob2QgYXN5bmNocm9ub3VzbHkuXG5cbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHksIGlmIHRydWUgaXMgZ2l2ZW4gYXMgdGhlIGZyb21TZXJ2ZXIgcGFyYW1ldGVyLFxuICAgICAgICAgICAgLy8gdGhlbiB0aGlzIGNhY2hlZCB2YWx1ZSB3aWxsIG5vdCBiZSB1c2VkLlxuXG4gICAgICAgICAgICBpZiAodGhpcy5pc0F1dGhlbnRpY2F0ZWQoKSAmJiBmcm9tU2VydmVyICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICRxLndoZW4oU2Vzc2lvbi51c2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTWFrZSByZXF1ZXN0IEdFVCAvc2Vzc2lvbi5cbiAgICAgICAgICAgIC8vIElmIGl0IHJldHVybnMgYSB1c2VyLCBjYWxsIG9uU3VjY2Vzc2Z1bExvZ2luIHdpdGggdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgLy8gSWYgaXQgcmV0dXJucyBhIDQwMSByZXNwb25zZSwgd2UgY2F0Y2ggaXQgYW5kIGluc3RlYWQgcmVzb2x2ZSB0byBudWxsLlxuICAgICAgICAgICAgcmV0dXJuICRodHRwLmdldCgnL3Nlc3Npb24nKS50aGVuKG9uU3VjY2Vzc2Z1bExvZ2luKS5jYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubG9naW4gPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgbG9naW4gY3JlZGVudGlhbHMuJyB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgICAgXG5cbiAgICAgICAgdGhpcy5zaWdudXAgPSBmdW5jdGlvbiAoY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIC8vc2VuZHMgYSBwb3N0IHJlcXVlc3QgY29udGFpbmluZyB0aGUgdXNlcidzIGNyZWRlbnRpYWxzIHRvIFxuICAgICAgICAgICAgcmV0dXJuICRodHRwLnBvc3QoJ2FwaS91c2Vycy9zaWdudXAnLCBjcmVkZW50aWFscylcbiAgICAgICAgICAgICAgICAvL29uY2UgdGhlIHVzZXIgaGFzIGJlZW4gY3JlYXRlZCBvbiB0aGUgYmFja2VuZC4uLlxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vYSBzZWNvbmQgcG9zdCByZXF1ZXN0IGlzIGNyZWF0ZWQgdG8gbG9nIHRoZSB1c2VyIGluXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkaHR0cC5wb3N0KCcvbG9naW4nLCBjcmVkZW50aWFscyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihvblN1Y2Nlc3NmdWxMb2dpbilcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJHEucmVqZWN0KHsgbWVzc2FnZTogJ0ludmFsaWQgc2lnbnVwIGNyZWRlbnRpYWxzLicgfSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJGh0dHAuZ2V0KCcvbG9nb3V0JykudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgU2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgICAgICAgICAgICAgJHJvb3RTY29wZS4kYnJvYWRjYXN0KEFVVEhfRVZFTlRTLmxvZ291dFN1Y2Nlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICB9KTtcblxuICAgIGFwcC5zZXJ2aWNlKCdTZXNzaW9uJywgZnVuY3Rpb24gKCRyb290U2NvcGUsIEFVVEhfRVZFTlRTKSB7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICRyb290U2NvcGUuJG9uKEFVVEhfRVZFTlRTLm5vdEF1dGhlbnRpY2F0ZWQsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNlbGYuZGVzdHJveSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2VsZi5kZXN0cm95KCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuaWQgPSBudWxsO1xuICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuY3JlYXRlID0gZnVuY3Rpb24gKHNlc3Npb25JZCwgdXNlcikge1xuICAgICAgICAgICAgdGhpcy5pZCA9IHNlc3Npb25JZDtcbiAgICAgICAgICAgIHRoaXMudXNlciA9IHVzZXI7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kZXN0cm95ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLnVzZXIgPSBudWxsO1xuICAgICAgICB9O1xuXG4gICAgfSk7XG5cbn0pKCk7XG4iLCJhcHAuY29uZmlnKGZ1bmN0aW9uICgkc3RhdGVQcm92aWRlcikge1xuJHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2VkaXRvci5xdWVzdFN0ZXAnLCB7XG5cdFx0dXJsOiAnL3F1ZXN0c3RlcC86cXVlc3RTdGVwSWQnLCBcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LXN0ZXAtZWRpdG9yL3F1ZXN0LXN0ZXAtZWRpdG9yLmh0bWwnLFxuXHRcdGNvbnRyb2xsZXI6ICdRdWVzdFN0ZXBFZGl0Q3RybCcsXG5cdFx0cmVzb2x2ZToge1xuXHRcdFx0cXVlc3Q6IGZ1bmN0aW9uKFF1ZXN0RmFjdG9yeSwgJHN0YXRlUGFyYW1zKXtcbiAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0UXVlc3RGYWN0b3J5LmdldE9uZVF1ZXN0KCRzdGF0ZVBhcmFtcy5pZCkgOiBcblx0XHRcdFx0XHR1bmRlZmluZWQ7XG4gICAgXHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgIFx0XHRhdXRoZW50aWNhdGU6IHRydWVcbiAgICBcdH1cblx0fSk7XG59KTtcblxuXG5hcHAuY29udHJvbGxlcignUXVlc3RTdGVwRWRpdEN0cmwnLCBmdW5jdGlvbiAoJHN0YXRlUGFyYW1zLCAkc2NvcGUsICRzdGF0ZSwgJHJvb3RTY29wZSwgcXVlc3QsIFF1ZXN0RmFjdG9yeSl7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkcm9vdFNjb3BlLmVkaXRvclZpc2libGUgPSBmYWxzZTtcblx0JHNjb3BlLnZpZXdNYXAgPSB0cnVlO1xuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHQkc2NvcGUudGFyZ2V0RXJyb3IgPSBmYWxzZTtcblx0JHNjb3BlLnRpdGxlRXJyb3IgPSBmYWxzZTtcblxuXHQvL2RlZmluZCBuZXcgU3RlcCBmb3IgYWRkaW5nIHRvIHN0ZXBzIGFycmF5XG5cdCRzY29wZS5uZXdTdGVwID0ge1xuXHRcdG5hbWU6ICdOZXcgU3RlcCcsXG5cdFx0dGFyZ2V0Q2lyY2xlOiB7XG5cdFx0XHRcdGNlbnRlcjogW10sXG5cdFx0XHRcdHJhZGl1czogbnVsbFxuXHRcdFx0fVxuXHRcdH07XG5cdC8vIGlmIHdlIGhhdmUgc3RlcHMsIGZpbmQgdGhlIGluZGV4IG9mIHRoZSBzdGVwIHRoYXQgbWF0Y2hlcyB0aGUgcGFyYW1zXG5cdGlmKCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCA+IDApIHtcblx0XHQkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5mb3JFYWNoKCBmdW5jdGlvbiAoc3RlcCwgaW5kZXgpIHtcblx0XHRcdGlmIChzdGVwLl9pZCA9PT0gJHN0YXRlUGFyYW1zLnF1ZXN0U3RlcElkKSB7XG5cdFx0XHRcdCRzY29wZS5xdWVzdC5pZHggPSBpbmRleDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHQvL3NldHMgY3VycmVudFN0ZXAgdG8gdGhhdCBtYXRjaGluZyB0aGUgcGFyYW1ldGVyc1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWyRzY29wZS5xdWVzdC5pZHhdO1xuXHR9IGVsc2Uge1xuXHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLnB1c2goJHNjb3BlLm5ld1N0ZXApO1xuXHRcdCRzY29wZS5jdXJyZW50U3RlcCA9ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdO1xuXHR9XG5cdC8vZnVuY3Rpb24gdG8gc3dpdGNoIHN0YXRlcyB3aXRoaW4gbWFwU3RhdGUgZWRpdG9yXG5cdCRzY29wZS5zd2l0Y2hTdGVwID0gZnVuY3Rpb24gKGNsaWNrZWRTdGVwKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8gJiYgJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvLnRpdGxlKSB7XG5cdFx0XHRRdWVzdEZhY3Rvcnkuc2F2ZSgkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyByZWRpcmVjdCB0byB0aGUgY2xpY2tlZCBtYXBzdGF0ZVxuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7cXVlc3RTdGVwSWQ6IGNsaWNrZWRTdGVwLl9pZH0pO1x0XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCEkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIGZsYXNoRXJyb3IoJ3RhcmdldEVycm9yJyk7XG5cdFx0XHRpZiAoISRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyB8fCAhJHNjb3BlLmN1cnJlbnRTdGVwLnRyYW5zaXRpb25JbmZvLnRpdGxlKSBmbGFzaEVycm9yKCd0aXRsZUVycm9yJyk7XG5cdFx0fVxuXHR9O1xuXHQkc2NvcGUuc2F2ZVF1ZXN0U3RlcHMgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCkge1xuXHRcdFx0Ly91cGRhdGUgcXVlc3Rcblx0XHRcdFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICh1cGRhdGVkUXVlc3QpIHtcblx0XHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvcicsIHtpZDogJHNjb3BlLnF1ZXN0Ll9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcdFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGZsYXNoRXJyb3IoJ3RhcmdldEVycm9yJyk7XG5cdH07XG5cdCRzY29wZS5hZGRRdWVzdFN0ZXAgPSBmdW5jdGlvbiAoKSB7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMucHVzaCgkc2NvcGUubmV3U3RlcCk7XG5cdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHQudGhlbiggZnVuY3Rpb24gKHVwZGF0ZWRRdWVzdCkge1xuXHRcdFx0JHNjb3BlLnF1ZXN0ID0gdXBkYXRlZFF1ZXN0O1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1skc2NvcGUucXVlc3QucXVlc3RTdGVwcy5sZW5ndGgtMV0uX2lkfSk7XG5cdFx0fSk7XG5cblx0fTtcblx0JHNjb3BlLnJlbW92ZVF1ZXN0U3RlcCA9IGZ1bmN0aW9uICgpIHtcblx0XHR2YXIgaW5kZXggPSAkc2NvcGUucXVlc3QucXVlc3RTdGVwcy5pbmRleE9mKCRzY29wZS5jdXJyZW50U3RlcCk7XG5cdFx0JHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRpZiAoaW5kZXggPT09ICRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmxlbmd0aCkgaW5kZXgtLTtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LnNhdmUoJHNjb3BlLnF1ZXN0KVxuXHRcdC50aGVuKCBmdW5jdGlvbiAodXBkYXRlZFF1ZXN0KSB7XG5cdFx0XHQkc2NvcGUucXVlc3QgPSB1cGRhdGVkUXVlc3Q7XG5cdFx0XHR2YXIgc3RlcERlc3RpbmF0aW9uID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoPT09MCA/IG51bGwgOiAkc2NvcGUucXVlc3QucXVlc3RTdGVwc1tpbmRleF0uX2lkO1xuXHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBzdGVwRGVzdGluYXRpb259LCB7cmVsb2FkOiB0cnVlfSk7XG5cdFx0fSk7XG5cdH07XG5cblx0ZnVuY3Rpb24gZmxhc2hFcnJvcihlcnJvclR5cGUpIHtcblx0XHQkc2NvcGVbZXJyb3JUeXBlXSA9IHRydWU7XG5cdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdCRzY29wZVtlcnJvclR5cGVdID0gZmFsc2U7IFxuXHRcdFx0JHNjb3BlLiRkaWdlc3QoKTtcblx0XHR9LCAzMDAwKTtcblx0fVxuXG5cblx0Ly8gTUFQIEJFTE9XID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09Pj5cblxuXHQvLyBpbml0aWFsaXplIG1hcFxuXHR2YXIgcXVlc3RTdGVwTWFwID0gTC5tYXAoJ3F1ZXN0LXN0ZXAtbWFwJyk7XG5cdHF1ZXN0U3RlcE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0Ly9hZGQgcGlyYXRlIG1hcCB0aWxlc1xuXHRMLnRpbGVMYXllcignaHR0cHM6Ly9hcGkudGlsZXMubWFwYm94LmNvbS92NC97aWR9L3t6fS97eH0ve3l9LnBuZz9hY2Nlc3NfdG9rZW49e2FjY2Vzc1Rva2VufScsIHtcbiAgICBtYXhab29tOiAxOCxcbiAgICBpZDogJ3Njb3R0ZWdncy5vNzYxNGpsMicsXG4gICAgYWNjZXNzVG9rZW46ICdway5leUoxSWpvaWMyTnZkSFJsWjJkeklpd2lZU0k2SW1OcGFEWm9aemhtZGpCak1EWjFjV281YUdjeWFYbHRlVGtpZlEuTFplMC1JQlJRbVowUGtRQnNZSWxpdydcblx0fSkuYWRkVG8ocXVlc3RTdGVwTWFwKTtcblxuXHQvLyBTZXQgdmlldyB1c2luZyB0YXJnZXRDaXJjbGUgZm9yIHRoaXMgc3RlcCBpZiBkZWZpbmVkXG5cdC8vIFRoZW4gdHJ5IGZpcnN0IHRhcmdldENpcmNsZSBmb3IgcXVlc3QgaWYgZGVmaW5lZFxuXHQvLyBPdGhlcndpc2UgZ2V0IHVzZXIncyBsb2NhdGlvbiBhbmQgc2V0IG1hcCB2aWV3IHdpdGggdGhhdFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIGlmICgkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXS50YXJnZXRDaXJjbGUuY2VudGVyLmxlbmd0aCA9PT0gMikge1xuXHRcdHF1ZXN0U3RlcE1hcC5zZXRWaWV3KCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzWzBdLnRhcmdldENpcmNsZS5jZW50ZXIsIDE1KTtcblx0fSBlbHNlIHtcblx0XHRxdWVzdFN0ZXBNYXAubG9jYXRlKCkub24oJ2xvY2F0aW9uZm91bmQnLCBmdW5jdGlvbiAoZSkge1xuXHRcdFx0dXNlckxvY2F0aW9uID0gW2UubGF0aXR1ZGUsZS5sb25naXR1ZGVdO1xuXHRcdFx0cXVlc3RTdGVwTWFwLnNldFZpZXcodXNlckxvY2F0aW9uLCAxNSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBJbml0aWFsaXplIHRoZSBGZWF0dXJlR3JvdXAgdG8gc3RvcmUgZWRpdGFibGUgbGF5ZXJzXG5cdHZhciBkcmF3bkl0ZW1zID0gbmV3IEwuRmVhdHVyZUdyb3VwKCk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRMYXllcihkcmF3bkl0ZW1zKTtcblxuXHQvLyBJbml0aWFsaXplIHRoZSBkcmF3IGNvbnRyb2wgYW5kIHBhc3MgaXQgdGhlIEZlYXR1cmVHcm91cCBvZiBlZGl0YWJsZSBsYXllcnNcblx0dmFyIGRyYXdDb250cm9sID0gbmV3IEwuQ29udHJvbC5EcmF3KHtcblx0ICAgIGRyYXc6IHtcblx0ICAgIFx0cG9seWxpbmU6IGZhbHNlLFxuXHQgICAgXHRwb2x5Z29uOiBmYWxzZSxcblx0ICAgIFx0cmVjdGFuZ2xlOiBmYWxzZSxcblx0ICAgIFx0bWFya2VyOiBmYWxzZVxuXHQgICAgfSxcblx0ICAgIGVkaXQ6IHtcblx0ICAgICAgICBmZWF0dXJlR3JvdXA6IGRyYXduSXRlbXNcblx0ICAgIH1cblx0fSk7XG5cdHF1ZXN0U3RlcE1hcC5hZGRDb250cm9sKGRyYXdDb250cm9sKTtcblx0Ly9pZiB0aGVyZSBpcyBhIHRhcmdldCByZWdpb24sIGRyYXcgaXQgb24gdGhlIG1hcFxuXHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoID09PSAyKSB7XG5cdFx0dmFyIGN1cnJlbnRSZWdpb24gPSBMLmNpcmNsZSgkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlciwkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyk7XG5cdFx0cXVlc3RTdGVwTWFwLmFkZExheWVyKGN1cnJlbnRSZWdpb24pO1xuXHR9XG5cdHZhciBjaXJjbGU7XG5cdHF1ZXN0U3RlcE1hcC5vbignZHJhdzpjcmVhdGVkJywgZnVuY3Rpb24gKGUpIHtcblx0Ly9yZW1vdmUgdGhlIGxvYWRlZCByZWdpb24gdGhlbiByZW1vdmUgYW55IG5ld2x5IGRyYXduIGNpcmNsZXNcbiAgXHRpZihjdXJyZW50UmVnaW9uKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY3VycmVudFJlZ2lvbik7XG4gIFx0aWYoY2lyY2xlKSBxdWVzdFN0ZXBNYXAucmVtb3ZlTGF5ZXIoY2lyY2xlKTtcbiAgXHR2YXIgdHlwZSA9IGUubGF5ZXJUeXBlO1xuICBcdHZhciBsYXllciA9IGUubGF5ZXI7XG4gIFx0Ly9hc3NpZ24gdGFyZ2V0IHJlZ2lvbiB0byBwcm9wZXJ0aWVzIG9mIGRyYXduIG9iamVjdFxuICAgICRzY29wZS5jdXJyZW50U3RlcC50YXJnZXRDaXJjbGUuY2VudGVyID0gW2xheWVyLl9sYXRsbmcubGF0LGxheWVyLl9sYXRsbmcubG5nXTtcbiAgICAkc2NvcGUuY3VycmVudFN0ZXAudGFyZ2V0Q2lyY2xlLnJhZGl1cyA9IGxheWVyLl9tUmFkaXVzO1xuICAgIC8vZGVjbGFyZSBuZXcgb2JqZWN0IGJhc2VkIG9uIHByb3BlcnRpZWQgZHJhd24gYW5kIGFkZCB0byBtYXBcbiAgICBjaXJjbGUgPSBMLmNpcmNsZShbbGF5ZXIuX2xhdGxuZy5sYXQsbGF5ZXIuX2xhdGxuZy5sbmddLCBsYXllci5fbVJhZGl1cyk7XG4gICAgcXVlc3RTdGVwTWFwLmFkZExheWVyKGNpcmNsZSk7XG5cdH0pO1xuXG5cdCRzY29wZS5nZXRNb2RhbEJ1dHRvblRleHQgPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoJHNjb3BlLmN1cnJlbnRTdGVwICYmICRzY29wZS5jdXJyZW50U3RlcC50cmFuc2l0aW9uSW5mbyAmJiAkc2NvcGUuY3VycmVudFN0ZXAudHJhbnNpdGlvbkluZm8ucXVlc3Rpb24pIHJldHVybiBcIlN1Ym1pdCFcIjtcblx0XHRyZXR1cm4gXCJHb3QgaXQhXCI7XG5cdH07XG59KTtcblxuXG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKSB7XG5cbiAgICAkc3RhdGVQcm92aWRlci5zdGF0ZSgnaG9tZScsIHtcbiAgICAgICAgdXJsOiAnLycsXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnanMvaG9tZS9ob21lLmh0bWwnLFxuICAgICAgICBjb250cm9sbGVyOiAnSG9tZUN0cmwnLFxuICAgICAgICByZXNvbHZlOiB7XG4gICAgICAgICAgICByZXF1ZXN0ZWRVc2VyOiBmdW5jdGlvbihBdXRoU2VydmljZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0hvbWVDdHJsJywgZnVuY3Rpb24gKCRzY29wZSwgQXV0aFNlcnZpY2UsICRzdGF0ZSwgcmVxdWVzdGVkVXNlcikge1xuICAgIC8vIElmIHRoZXJlJ3MgYSBsb2dnZWQgaW4gdXNlciB1cG9uIGxvYWQsIGdvIHRvIHRoZSBkYXNoYm9hcmRcbiAgICBpZiAocmVxdWVzdGVkVXNlcikgJHN0YXRlLmdvKCdkYXNoYm9hcmQnLCB7dXNlcklkOiByZXF1ZXN0ZWRVc2VyLl9pZH0pO1xuXG4gICAgJHNjb3BlLmhvbWUgPSB0cnVlOyAvLyBUbyBrbm93IHdoYXQgbmF2IGxpbmtzIHRvIHNob3dcbiAgICAkc2NvcGUubG9naW4gPSB7fTtcbiAgICAkc2NvcGUuc2lnbnVwID0ge307XG4gICAgJHNjb3BlLmxvZ2luRXJyb3IgPSBudWxsO1xuICAgICRzY29wZS5zaWdudXBFcnJvciA9IG51bGw7XG5cbiAgICAkc2NvcGUuc2VuZExvZ2luID0gZnVuY3Rpb24gKGxvZ2luSW5mbykge1xuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuICAgICAgICBjb25zb2xlLmxvZygnbG9naW5JbmZvJywgbG9naW5JbmZvKVxuICAgICAgICBBdXRoU2VydmljZS5sb2dpbihsb2dpbkluZm8pLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdmb3VuZCBleGlzdGluZyB1c2VyJywgdXNlcik7XG4gICAgICAgICAgICAkc3RhdGUuZ28oJ2Rhc2hib2FyZCcsIHt1c2VySWQ6IHVzZXIuX2lkfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICRzY29wZS5sb2dpbkVycm9yID0gXCJJIHRoaW5rIHlvdVxcJ3ZlIGVudGVyZWQgdGhlIHdyb25nIGluZm8sIGZyaWVuZFwiO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgJHNjb3BlLnNlbmRTaWdudXAgPSBmdW5jdGlvbihzaWdudXBJbmZvKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdsb2dpbkluZm8nLCBzaWdudXBJbmZvKVxuICAgICAgICAkc2NvcGUuZXJyb3IgPSBudWxsO1xuICAgICAgICBBdXRoU2VydmljZS5zaWdudXAoc2lnbnVwSW5mbykudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ21hZGUgbmV3IHVzZXInLCB1c2VyKTtcbiAgICAgICAgICAgICRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogdXNlci5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG4gICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAkc2NvcGUuc2lnbnVwRXJyb3IgPSBcIkknbSBhZnJhaWQgd2UgYWxyZWFkeSBoYXZlIHNvbWVvbmUgYnkgdGhhdCBuYW1lXCI7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBQYXJhbGF4IGVmZmVjdCBmb3IgaW1hZ2VzXG4gICAgJChmdW5jdGlvbigpIHtcbiAgICAvLyBDYWNoZSB0aGUgd2luZG93IG9iamVjdCAobWFrZXMgbG9hZCB0aW1lIGZhc3RlcilcbiAgICB2YXIgJHdpbmRvdyA9ICQod2luZG93KTtcbiAgICAvLyBQYXJhbGxheCBiYWNrZ3JvdW5kIGVmZmVjdFxuICAgICQoJ3NlY3Rpb25bZGF0YS10eXBlPVwiYmFja2dyb3VuZFwiXScpLmVhY2goZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciAkYmdvYmogPSAkKHRoaXMpOyAvLyBhc3NpZ25pbmcgdGhlIG9iamVjdFxuICAgICAgICAkKHdpbmRvdykuc2Nyb2xsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy9zY3JvbGwgdGhlIGJhY2tncm91bmQgYXQgdmFyIHNwZWVkXG4gICAgICAgICAgICAvLyB0aGUgeVBvcyBpcyBhIG5lZ2F0aXZlIGJlY2F1c2Ugd2UncmUgc2Nyb2xsaW5nIGl0IHVwXG4gICAgICAgICAgICB2YXIgeVBvcyA9IC0oJHdpbmRvdy5zY3JvbGxUb3AoKSAvICRiZ29iai5kYXRhKCdzcGVlZCcpKTtcbiAgICAgICAgICAgIC8vIFB1dCB0b2dldGhlciBvdXIgZmluYWwgYmFja2dyb3VuZCBwb3NpdGlvblxuICAgICAgICAgICAgdmFyIGNvb3JkcyA9ICc1MCUgJyArIHlQb3MgKyAncHgnO1xuICAgICAgICAgICAgLy8gTW92ZSB0aGUgYmFja2dyb3VuZFxuICAgICAgICAgICAgJGJnb2JqLmNzcyh7IGJhY2tncm91bmRQb3NpdGlvbjogY29vcmRzIH0pO1xuICAgICAgICB9KTsgLy8gZW5kIHdpbmRvdyBzY3JvbGxcbiAgICB9KTtcbn0pO1xuXG5cblxufSk7IiwiYXBwLmNvbmZpZyhmdW5jdGlvbiAoJHN0YXRlUHJvdmlkZXIpe1xuXHQkc3RhdGVQcm92aWRlci5zdGF0ZSgnZWRpdG9yJyxcblx0XHR7XG5cdFx0XHR1cmw6ICcvZWRpdG9yLzppZCcsXG5cdFx0XHR0ZW1wbGF0ZVVybDogJ2pzL3F1ZXN0LWVkaXRvci9lZGl0b3IuaHRtbCcsXG5cdFx0XHRjb250cm9sbGVyOiAnRWRpdG9yQ3RybCcsXG5cdFx0ICAgIHJlc29sdmU6IHtcblx0XHQgICAgXHRxdWVzdDogZnVuY3Rpb24oUXVlc3RGYWN0b3J5LCAkc3RhdGVQYXJhbXMpe1xuXHRcdCAgICBcdFx0cmV0dXJuICRzdGF0ZVBhcmFtcy5pZCAhPT0gXCJcIiA/XG5cdFx0XHRcdFx0XHRRdWVzdEZhY3RvcnkuZ2V0T25lUXVlc3QoJHN0YXRlUGFyYW1zLmlkKSA6IFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkO1xuXHRcdCAgICBcdH1cblx0XHQgICAgfSxcblx0XHRcdGRhdGE6IHtcblx0ICAgICAgICBhdXRoZW50aWNhdGU6IHRydWVcblx0ICAgIH1cblx0fSk7XG59KTtcblxuYXBwLmNvbnRyb2xsZXIoJ0VkaXRvckN0cmwnLCBmdW5jdGlvbiAoJHNjb3BlLCAkc3RhdGVQYXJhbXMsICR1aWJNb2RhbCwgJHN0YXRlLCAkcm9vdFNjb3BlLCBxdWVzdCwgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5LCBBdXRoU2VydmljZSkge1xuXHQvL3ZhcmlhYmxlIHNhdmVkIHRvIHNob3cvaGlkZSBxdWVzdCBlZGl0b3Igd2hlbiBlZGl0aW5nIGluZGl2aWR1YWwgc3RhdGVzXG5cdCRyb290U2NvcGUuZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdCRzY29wZS5xdWVzdCA9IHF1ZXN0O1xuXHQkc2NvcGUudmlld01haW5NYXAgPSB0cnVlO1xuXHQkc2NvcGUubmV3UXVlc3QgPSBmYWxzZTtcblx0Ly9pZiB0aGVyZSBpcyBubyBxdWVzdCwgZGVmaW5lIG9uZVxuXHRpZighcXVlc3QpIHtcblx0XHQkc2NvcGUubmV3UXVlc3QgPSB0cnVlO1xuXHRcdCRzY29wZS5xdWVzdD0ge307XG5cdH1cblxuXHQvL3VwZGF0ZSBxdWVzdCBhbmQgZ28gdG8gZGFzaGJvYXJkIGZvciBjdXJyZW50IHVzZXJcblx0JHNjb3BlLnNhdmVRdWVzdCA9IGZ1bmN0aW9uICgpIHtcblx0XHQvLyBmaWx0ZXIgb3V0IGFsbCBxdWVzdFN0ZXBzIHdpdGhvdXQgdGFyZ2V0Q2lybGNsZXMgb3IgdHJhbnNpdGlvbkluZm8udGl0bGVcblx0XHRpZiAoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzID0gJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMuZmlsdGVyKGZ1bmN0aW9uKHN0ZXApIHtcblx0XHRcdFx0cmV0dXJuIChzdGVwLnRhcmdldENpcmNsZS5jZW50ZXIubGVuZ3RoICYmIHN0ZXAudHJhbnNpdGlvbkluZm8udGl0bGUpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcdFx0XG5cdFx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogU2Vzc2lvbi51c2VyLl9pZH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdCRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogU2Vzc2lvbi51c2VyLl9pZH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXHQvL2dvIHRvIG1hcFN0YXRlcyBlZGl0b3IgYW5kIGhpZGUgUXVlc3QgZWRpdG9yIFxuXHQkc2NvcGUudHJhbnNpdGlvblRvTWFwU3RhdGVFZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0aWYoISRzY29wZS5uZXdRdWVzdCkge1xuXHRcdFx0cmV0dXJuIFF1ZXN0RmFjdG9yeS5zYXZlKCRzY29wZS5xdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdlZGl0b3IucXVlc3RTdGVwJywge3F1ZXN0U3RlcElkOiBudWxsfSk7XG5cdFx0XHRcdH0gZWxzZSB7IFxuXHRcdFx0XHRcdCRzdGF0ZS5nbygnZWRpdG9yLnF1ZXN0U3RlcCcsIHtxdWVzdFN0ZXBJZDogJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0uX2lkfSk7XHRcblx0XHRcdFx0fVxuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWVzdEZhY3Rvcnkuc2F2ZU5ldygkc2NvcGUucXVlc3QpXG5cdFx0XHQudGhlbihmdW5jdGlvbiAoc2F2ZWRRdWVzdCkge1xuXHRcdFx0XHQkc2NvcGUuZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHQkc3RhdGUuZ28oJ2VkaXRvci5xdWVzdFN0ZXAnLCB7aWQ6IHNhdmVkUXVlc3QuX2lkLCBxdWVzdFN0ZXBJZDogbnVsbH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9O1xuXG5cdCRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIEF1dGhTZXJ2aWNlLmxvZ291dCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAkc3RhdGUuZ28oJ2hvbWUnKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuXHQvLyoqKioqKioqKioqICBNQVAgRlVOQ1RJT05TIEJFTE9XICAqKioqKioqKioqKioqKioqKioqKioqKlxuXHR2YXIgdXNlckxvY2F0aW9uO1xuXHR2YXIgdGFyZ2V0Q2lyY2xlcyA9IFtdO1xuXHR2YXIgY2lyY2xlQ2VudGVycyA9IFtdO1xuXHR2YXIgcXVlc3RNYXAgPSBMLm1hcCgncXVlc3QtbWFwJykuc2V0VmlldyhbNDAuNzIzMDA4LC03NC4wMDA2MzI3XSwgMTMpO1xuXHRxdWVzdE1hcC5zY3JvbGxXaGVlbFpvb20uZGlzYWJsZSgpOyAvLyBSZWFsbHkgYW5ub3lpbmcgd2hlbiBpdCBoYXBwZW5zIGFjY2lkZW50bHlcblx0TC50aWxlTGF5ZXIoJ2h0dHBzOi8vYXBpLnRpbGVzLm1hcGJveC5jb20vdjQve2lkfS97en0ve3h9L3t5fS5wbmc/YWNjZXNzX3Rva2VuPXthY2Nlc3NUb2tlbn0nLCB7XG4gICAgbWF4Wm9vbTogMTgsXG4gICAgaWQ6ICdzY290dGVnZ3Mubzc2MTRqbDInLFxuICAgIGFjY2Vzc1Rva2VuOiAncGsuZXlKMUlqb2ljMk52ZEhSbFoyZHpJaXdpWVNJNkltTnBhRFpvWnpobWRqQmpNRFoxY1dvNWFHY3lhWGx0ZVRraWZRLkxaZTAtSUJSUW1aMFBrUUJzWUlsaXcnXG5cdH0pLmFkZFRvKHF1ZXN0TWFwKTtcblxuXHQvLyBJZiB0aGVyZSBhcmUgbm8gdGFyZ2V0Q2lyY2xlcyB5ZXQgY3JlYXRlZCwgc2V0IG1hcCB2aWV3IHRvIHVzZXIncyBsb2NhdGlvblxuXHRpZiAoISRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzIHx8ICEkc2NvcGUucXVlc3QucXVlc3RTdGVwc1swXSB8fCAhJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHNbMF0udGFyZ2V0Q2lyY2xlKSB7XG5cblx0XHRxdWVzdE1hcC5sb2NhdGUoKS5vbignbG9jYXRpb25mb3VuZCcsIGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR1c2VyTG9jYXRpb24gPSBbZS5sYXRpdHVkZSxlLmxvbmdpdHVkZV07XG5cdFx0XHRxdWVzdE1hcC5zZXRWaWV3KHVzZXJMb2NhdGlvbiwgMTQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gUmVkcmF3IGFsbCB0YXJnZXRDaXJjbGVzIGZvciB0aGUgcXVlc3Qgb24gdGhlIG1hcCBhbmQgcmVzZXQgdGhlIGJvdW5kc1xuXHRmdW5jdGlvbiBkcmF3Q2lyY2xlcygpIHtcblx0XHQvLyBSZW1vdmUgYWxsIGNpcmNsZXNcblx0XHR0YXJnZXRDaXJjbGVzLmZvckVhY2goZnVuY3Rpb24oY2lyY2xlKSB7XG5cdFx0XHRxdWVzdE1hcC5yZW1vdmVMYXllcihjaXJjbGUpO1xuXHRcdH0pO1xuXHRcdC8vIERyYXcgYSBjaXJjbGUgZm9yIGV2ZXJ5IHRhcmdldENpcmNsZSBpbiB0aGUgcXVlc3Rcblx0XHRpZiAoJHNjb3BlLnF1ZXN0LnF1ZXN0U3RlcHMpIHtcblx0XHRcdCRzY29wZS5xdWVzdC5xdWVzdFN0ZXBzLmZvckVhY2goZnVuY3Rpb24oc3RlcCwgaW5kZXgpIHtcblx0XHRcdFx0aWYgKHN0ZXAudGFyZ2V0Q2lyY2xlICYmIHN0ZXAudGFyZ2V0Q2lyY2xlLmNlbnRlci5sZW5ndGgpIHtcblx0XHRcdFx0XHR2YXIgY2VudGVyID0gc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyO1xuXHRcdFx0XHRcdHZhciByYWRpdXMgPSBzdGVwLnRhcmdldENpcmNsZS5yYWRpdXM7XG5cdFx0XHRcdFx0dmFyIGNpcmNsZSA9IEwuY2lyY2xlKGNlbnRlcixyYWRpdXMpO1xuXHRcdFx0XHRcdGNpcmNsZS5iaW5kTGFiZWwoKGluZGV4KzEpLnRvU3RyaW5nKCksIHsgbm9IaWRlOiB0cnVlIH0pLmFkZFRvKHF1ZXN0TWFwKTtcblx0XHRcdFx0XHR0YXJnZXRDaXJjbGVzLnB1c2goY2lyY2xlKTtcblx0XHRcdFx0XHRjaXJjbGVDZW50ZXJzLnB1c2goc3RlcC50YXJnZXRDaXJjbGUuY2VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoY2lyY2xlQ2VudGVycy5sZW5ndGgpIHF1ZXN0TWFwLmZpdEJvdW5kcyhjaXJjbGVDZW50ZXJzKTtcblx0XHR9XG5cdH1cblx0ZHJhd0NpcmNsZXMoKTtcblxufSk7XG5cbiIsImFwcC5jb25maWcoZnVuY3Rpb24gKCRzdGF0ZVByb3ZpZGVyKXtcblx0JHN0YXRlUHJvdmlkZXIuc3RhdGUoJ2Rhc2hib2FyZCcse1xuXHRcdHVybDogJy9kYXNoYm9hcmQvOnVzZXJJZCcsXG5cdFx0dGVtcGxhdGVVcmw6ICdqcy91c2VyLWRhc2hib2FyZC9kYXNoYm9hcmQuaHRtbCcsXG5cdFx0Y29udHJvbGxlcjogJ0Rhc2hDdHJsJyxcblx0XHRyZXNvbHZlOiB7XG5cdFx0XHR1c2VyUXVlc3RzOiBmdW5jdGlvbihRdWVzdEZhY3RvcnksICRzdGF0ZVBhcmFtcyl7XG5cdFx0XHRcdHJldHVybiBRdWVzdEZhY3RvcnkuZ2V0VXNlclF1ZXN0cygkc3RhdGVQYXJhbXMudXNlcklkKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGRhdGE6IHtcbiAgICAgICAgICAgIGF1dGhlbnRpY2F0ZTogdHJ1ZVxuICAgICAgICB9XG5cdH0pO1xufSk7XG5cbmFwcC5jb250cm9sbGVyKCdEYXNoQ3RybCcsIGZ1bmN0aW9uICgkc3RhdGUsICRzY29wZSwgdXNlclF1ZXN0cywgU2Vzc2lvbiwgUXVlc3RGYWN0b3J5KXtcblx0JHNjb3BlLnF1ZXN0cyA9IFtdO1xuXHQkc2NvcGUucXVlc3RzID0gdXNlclF1ZXN0cy5tYXAoZnVuY3Rpb24oZykgeyBcblx0XHRnLnNob3dEZXRhaWwgPSBmYWxzZTtcblx0XHRyZXR1cm4gZztcblx0fSk7XG5cblx0JHNjb3BlLmdvVG9FZGl0b3IgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0JHN0YXRlLmdvKCdlZGl0b3InLCB7aWQ6IHF1ZXN0Q2xpY2tlZC5faWR9LCB7cmVsb2FkOiB0cnVlfSk7XG5cdH07XG5cdCRzY29wZS5kZWxldGVRdWVzdCA9IGZ1bmN0aW9uIChxdWVzdENsaWNrZWQpIHtcblx0XHRyZXR1cm4gUXVlc3RGYWN0b3J5LmRlbGV0ZShxdWVzdENsaWNrZWQpXG5cdFx0LnRoZW4oIGZ1bmN0aW9uIChkZWxldGVkUXVlc3QpIHtcblx0XHRcdCRzdGF0ZS5nbygnZGFzaGJvYXJkJywge3VzZXJJZDogU2Vzc2lvbi51c2VyLl9pZH0sIHtyZWxvYWQ6IHRydWV9KTtcblx0XHR9KTtcblx0fTtcblx0JHNjb3BlLnBhcmVudENsaWNrID0gZnVuY3Rpb24oaW5kZXgpIHtcblx0XHR2YXIgcXVlc3QgPSAkc2NvcGUucXVlc3RzW2luZGV4XTtcblx0XHRxdWVzdC5zaG93RGV0YWlsID0gIXF1ZXN0LnNob3dEZXRhaWw7XG5cdH07XG5cdCRzY29wZS5zd2l0Y2hBY3RpdmUgPSBmdW5jdGlvbiAocXVlc3RDbGlja2VkKSB7XG5cdFx0UXVlc3RGYWN0b3J5LnNhdmUocXVlc3RDbGlja2VkKTtcblx0fTtcblxufSk7XG5cbiIsImFwcC5mYWN0b3J5KCdRdWVzdEZhY3RvcnknLCBmdW5jdGlvbiAoJGh0dHAsIFNlc3Npb24pIHtcblxuXHRyZXR1cm4ge1xuXG5cdFx0Z2V0QWxsUXVlc3RzOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzJylcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcykge1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGdldE9uZVF1ZXN0OiBmdW5jdGlvbihxdWVzdElkKXtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzLycgKyBxdWVzdElkKVxuXHRcdFx0XHQudGhlbihmdW5jdGlvbihyZXMpe1xuXHRcdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdFx0fSk7XG5cdFx0fSxcblx0XHRnZXRVc2VyUXVlc3RzOiBmdW5jdGlvbih1c2VySWQpIHtcblx0XHRcdHJldHVybiAkaHR0cC5nZXQoJy9hcGkvcXVlc3RzL3VzZXJxdWVzdHMvJyArIHVzZXJJZClcblx0XHRcdC50aGVuKGZ1bmN0aW9uKHJlcyl7XG5cdFx0XHRcdHJldHVybiByZXMuZGF0YTtcblx0XHRcdH0pO1xuXHRcdH0sXG5cdFx0c2F2ZTogZnVuY3Rpb24gKHF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gJGh0dHAucHV0KCcvYXBpL3F1ZXN0cy8nICsgcXVlc3QuX2lkLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpe1xuXHRcdFx0XHRyZXR1cm4gcmVzLmRhdGE7XG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdHNhdmVOZXc6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cXVlc3QuYXV0aG9yID0gU2Vzc2lvbi51c2VyLl9pZDtcblx0XHRcdHJldHVybiAkaHR0cC5wb3N0KCcvYXBpL3F1ZXN0cy8nLCBxdWVzdClcblx0XHRcdC50aGVuKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHJlcy5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRkZWxldGU6IGZ1bmN0aW9uIChxdWVzdCkge1xuXHRcdFx0cmV0dXJuICRodHRwLmRlbGV0ZSgnL2FwaS9xdWVzdHMvJyArIHF1ZXN0Ll9pZCk7XG5cdFx0fVxuXHR9O1xufSk7XG4iLCJhcHAuZGlyZWN0aXZlKCdibHVlSGVhZGVyJywgZnVuY3Rpb24oQXV0aFNlcnZpY2UsICRzdGF0ZSkge1xuXHRcblx0cmV0dXJuIHtcblx0XHRyZXN0cmljdDogJ0UnLFxuXHRcdHNjb3BlOiB7XG5cdFx0XHRoZWFkOiAnQCcsXG5cdFx0XHRzbWFsbDogJ0AnXG5cdFx0fSxcblx0XHR0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2JsdWUtaGVhZGVyL2JsdWUtaGVhZGVyLmh0bWwnLFxuXHRcdGxpbms6IGZ1bmN0aW9uKHNjb3BlKSB7XG5cblx0XHRcdHNjb3BlLnVzZXIgPSBudWxsO1xuXG5cdFx0XHR2YXIgc2V0VXNlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBBdXRoU2VydmljZS5nZXRMb2dnZWRJblVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSB1c2VyO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG5cdFx0XHRzY29wZS5sb2dvdXQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0QXV0aFNlcnZpY2UubG9nb3V0KClcblx0XHRcdFx0LnRoZW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0JHN0YXRlLmdvKCdob21lJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdH1cblx0fTtcblxufSk7IiwiYXBwLmRpcmVjdGl2ZSgnZnVsbHN0YWNrTG9nbycsIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICByZXN0cmljdDogJ0UnLFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL2Z1bGxzdGFjay1sb2dvL2Z1bGxzdGFjay1sb2dvLmh0bWwnXG4gICAgfTtcbn0pOyIsImFwcC5kaXJlY3RpdmUoJ3Jlc29sdmVMb2FkZXInLCBmdW5jdGlvbigkcm9vdFNjb3BlLCAkdGltZW91dCkge1xuXG4gIHJldHVybiB7XG4gICAgcmVzdHJpY3Q6ICdFJyxcbiAgICByZXBsYWNlOiB0cnVlLFxuICAgIHRlbXBsYXRlOiAnPGRpdiBjbGFzcz1cImFsZXJ0IGFsZXJ0LXN1Y2Nlc3MgbmctaGlkZVwiPjxzdHJvbmc+TG9hZGluZyB1cCE8L3N0cm9uZz48L2Rpdj4nLFxuICAgIGxpbms6IGZ1bmN0aW9uKHNjb3BlLCBlbGVtZW50KSB7XG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3RhcnQnLCBmdW5jdGlvbihldmVudCwgY3VycmVudFJvdXRlLCBwcmV2aW91c1JvdXRlKSB7XG5cbiAgICAgICAgJHRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcygnbmctaGlkZScpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICAkcm9vdFNjb3BlLiRvbignJHN0YXRlQ2hhbmdlU3VjY2VzcycsIGZ1bmN0aW9uKCkge1xuICAgICAgICBlbGVtZW50LmFkZENsYXNzKCduZy1oaWRlJyk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG59KTsiLCJhcHAuZGlyZWN0aXZlKCduYXZiYXInLCBmdW5jdGlvbiAoJHJvb3RTY29wZSwgQXV0aFNlcnZpY2UsIEFVVEhfRVZFTlRTLCAkc3RhdGUpIHtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc3RyaWN0OiAnRScsXG4gICAgICAgIHNjb3BlOiB7XG4gICAgICAgICAgICBob21lOiAnPScsXG4gICAgICAgICAgICBkYXNoYm9hcmQ6ICc9J1xuICAgICAgICB9LFxuICAgICAgICB0ZW1wbGF0ZVVybDogJ2pzL2NvbW1vbi9kaXJlY3RpdmVzL25hdmJhci9uYXZiYXIuaHRtbCcsXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSkge1xuXG4gICAgICAgICAgICBzY29wZS5pdGVtcyA9IFtcbiAgICAgICAgICAgICAgICB7IGxhYmVsOiAnRGFzaGJvYXJkJywgc3RhdGU6ICdob21lJyAsIGF1dGg6IHRydWV9LFxuICAgICAgICAgICAgICAgIHsgbGFiZWw6ICdOZXcgUXVlc3QnLCBzdGF0ZTogJ2VkaXRvcicsIGF1dGg6IHRydWUgfVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgc2NvcGUudXNlciA9IG51bGw7XG5cbiAgICAgICAgICAgIHNjb3BlLmlzTG9nZ2VkSW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmlzQXV0aGVudGljYXRlZCgpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgdmFyIHNldFVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgQXV0aFNlcnZpY2UuZ2V0TG9nZ2VkSW5Vc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgICAgICAgICAgICAgICBzY29wZS51c2VyID0gdXNlcjtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHZhciByZW1vdmVVc2VyID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHNjb3BlLnVzZXIgPSBudWxsO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VXNlcigpO1xuXG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5sb2dpblN1Y2Nlc3MsIHNldFVzZXIpO1xuICAgICAgICAgICAgJHJvb3RTY29wZS4kb24oQVVUSF9FVkVOVFMubG9nb3V0U3VjY2VzcywgcmVtb3ZlVXNlcik7XG4gICAgICAgICAgICAkcm9vdFNjb3BlLiRvbihBVVRIX0VWRU5UUy5zZXNzaW9uVGltZW91dCwgcmVtb3ZlVXNlcik7XG5cbiAgICAgICAgICAgIC8vIFByZXR0eSBTY3JvbGxpbmcgTmF2YmFyIEVmZmVjdFxuICAgICAgICAgICAgJCh3aW5kb3cpLnNjcm9sbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoJCgnLm5hdmJhcicpLm9mZnNldCgpLnRvcCA+IDUwICYmIHNjb3BlLmhvbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnLm5hdmJhci1maXhlZC10b3AnKS5hZGRDbGFzcygndG9wLW5hdi1jb2xsYXBzZScpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2NvcGUuaG9tZSkge1xuICAgICAgICAgICAgICAgICAgICAkKCcubmF2YmFyLWZpeGVkLXRvcCcpLnJlbW92ZUNsYXNzKCd0b3AtbmF2LWNvbGxhcHNlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEFuaW1hdGVkIFNjcm9sbCBUbyBTZWN0aW9uXG4gICAgICAgICAgICAkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICQoJy5wYWdlLXNjcm9sbCBhJykuYmluZCgnY2xpY2snLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyICRhbmNob3IgPSAkKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICAkKCdodG1sLCBib2R5Jykuc3RvcCgpLmFuaW1hdGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsVG9wOiAkKCRhbmNob3IuYXR0cignaHJlZicpKS5vZmZzZXQoKS50b3BcbiAgICAgICAgICAgICAgICAgICAgfSwgMTUwMCwgJ2Vhc2VJbk91dEV4cG8nKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cblxuICAgIH07XG5cbn0pO1xuIl0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
