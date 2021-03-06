# encoding: utf-8

require 'dropbox_sdk'

module CartoDB
  module Datasources
    module Url
      class Dropbox < BaseOAuth

        # Required for all datasources
        DATASOURCE_NAME = 'dropbox'

        # Specific of this datasource
        FORMATS_TO_SEARCH_QUERIES = {
            FORMAT_CSV =>         %W( .csv ),
            FORMAT_EXCEL =>       %W( .xls .xlsx ),
            FORMAT_GPX =>         %W( .kml ),
            FORMAT_KML =>         %W( .gpx ),
            FORMAT_PNG =>         %W( .png ),
            FORMAT_JPG =>         %W( .jpg .jpeg ),
            FORMAT_SVG =>         %W( .svg ),
            FORMAT_COMPRESSED =>  %W( .zip )
        }

        # Constructor (hidden)
        # @param config
        # [
        #  'app_key'
        #  'app_secret'
        # ]
        # @param user User
        # @throws UninitializedError
        # @throws MissingConfigurationError
        def initialize(config, user)

          raise UninitializedError.new('missing user instance', DATASOURCE_NAME)        if user.nil?
          raise MissingConfigurationError.new('missing app_key', DATASOURCE_NAME)       unless config.include?('app_key')
          raise MissingConfigurationError.new('missing app_secret', DATASOURCE_NAME)    unless config.include?('app_secret')
          raise MissingConfigurationError.new('missing callback_url', DATASOURCE_NAME)  unless config.include?('callback_url')

          @user               = user
          @app_key            = config.fetch('app_key')
          @app_secret         = config.fetch('app_secret')
          @callback_url       = config.fetch('callback_url')

          self.filter   = []
          @access_token = nil
          @auth_flow    = nil
          @client       = nil
        end #initialize

        # Factory method
        # @param config : {}
        # @param user : User
        # @return CartoDB::Synchronizer::FileProviders::Dropbox
        def self.get_new(config, user)
          return new(config, user)
        end #get_new

        # If will provide a url to download the resource, or requires calling get_resource()
        # @return bool
        def providers_download_url?
          false
        end

        # Return the url to be displayed or sent the user to to authenticate and get authorization code
        # @param use_callback_flow : bool
        # @throws AuthError
        def get_auth_url(use_callback_flow=true)
          if use_callback_flow
            @auth_flow = DropboxOAuth2Flow.new(@app_key, @app_secret, @callback_url, {}, :csrf_token)
          else
            @auth_flow = DropboxOAuth2FlowNoRedirect.new(@app_key, @app_secret)
          end
          @auth_flow.start(CALLBACK_STATE_DATA_PLACEHOLDER.sub('user', @user.username).sub('service', DATASOURCE_NAME))
        rescue DropboxError, ArgumentError => ex
          raise AuthError.new("get_auth_url(#{use_callback_flow}): #{ex.message}", DATASOURCE_NAME)
        end #get_auth_url

        # Validate authorization code and store token
        # @param auth_code : string
        # @return string : Access token
        # @throws AuthError
        def validate_auth_code(auth_code)
          @auth_flow = DropboxOAuth2FlowNoRedirect.new(@app_key, @app_secret)
          data = @auth_flow.finish(auth_code)
          @access_token = data[0] # Only keep the access token
          @auth_flow = nil
          @client = DropboxClient.new(@access_token)
          @access_token
        rescue DropboxError, ArgumentError => ex
          raise AuthError.new("validate_auth_code(): #{ex.message}", DATASOURCE_NAME)
        end #validate_auth_code

        # Validates the authorization callback
        # @param params : mixed
        def validate_callback(params)
          session = {csrf_token: params[:state].split('|').first.presence }
          @auth_flow = DropboxOAuth2Flow.new(@app_key, @app_secret, @callback_url, session, :csrf_token)
          data = @auth_flow.finish(params)
          @access_token = data[0] # Only keep the access token
          @auth_flow = nil
          @client = DropboxClient.new(@access_token)
          @access_token
        rescue DropboxError, ArgumentError => ex
          raise AuthError.new("validate_callback(#{params.inspect}): #{ex.message}", DATASOURCE_NAME)
        end #validate_callback

        # Set the token
        # @param token string
        # @throws TokenExpiredOrInvalidError
        # @throws AuthError
        def token=(token)
          @access_token = token
          @client = DropboxClient.new(@access_token)
        rescue => ex
          handle_error(ex, "token= : #{ex.message}")
        end #token=

        # Retrieve set token
        # @return string | nil
        def token
          @access_token
        end #token

        # Perform the listing and return results
        # @param filter Array : (Optional) filter to specify which resources to retrieve. Leave empty for all supported.
        # @return [ { :id, :title, :url, :service } ]
        # @throws TokenExpiredOrInvalidError
        # @throws AuthError
        # @throws DataDownloadError
        def get_resources_list(filter=[])
          all_results = []
          self.filter = filter

          @formats.each do |search_query|
            response = @client.search('/', search_query)
            response.each do |item|
              all_results.push(format_item_data(item))
            end
          end
          all_results
        rescue => ex
          handle_error(ex, "get_resources_list(): #{ex.message}")
        end #get_resources_list

        # Retrieves a resource and returns its contents
        # @param id string
        # @return mixed
        # @throws TokenExpiredOrInvalidError
        # @throws AuthError
        # @throws DataDownloadError
        def get_resource(id)
          contents,  = @client.get_file_and_metadata(id)
          contents
        rescue => ex
          handle_error(ex, "get_resource() #{id}: #{ex.message}")
        end #get_resource

        # @param id string
        # @return Hash
        # @throws TokenExpiredOrInvalidError
        # @throws AuthError
        # @throws DataDownloadError
        def get_resource_metadata(id)
          response = @client.metadata(id)
          item_data = format_item_data(response)

          item_data.to_hash
        rescue => ex
          handle_error(ex, "get_resource_metadata() #{id}: #{ex.message}")
        end #get_resource_metadata

        # Retrieves current filters
        # @return {}
        def filter
          @formats
        end #filter

        # Sets current filters
        # @param filter_data {}
        def filter=(filter_data=[])
          @formats = []
          FORMATS_TO_SEARCH_QUERIES.each do |id, queries|
            if filter_data.empty? || filter_data.include?(id)
              queries.each do |query|
                @formats = @formats.push(query)
              end
            end
          end
        end #filter=

        # Just return datasource name
        # @return string
        def to_s
          DATASOURCE_NAME
        end

        # Checks if token is still valid or has been revoked
        # @return bool
        # @throws AuthError
        def token_valid?
        # Any call would do, we just want to see if communicates or refuses the token
          @client.account_info
          true
        rescue DropboxError => ex
          error_code = ex.http_response.code.to_i
          raise AuthError.new("token_valid? : #{ex.message}") unless (error_code == 401 || error_code == 403)
          false
        end #token_valid?

        # Revokes current set token
        def revoke_token
          @client.disable_access_token
          true
        rescue => ex
          raise AuthError.new("revoke_token: #{ex.message}", DATASOURCE_NAME)
        end #revoke_token

        private

        # Handles
        # @param original_exception mixed
        # @param message string
        # @throws TokenExpiredOrInvalidError
        # @throws AuthError
        # @throws mixed
        def handle_error(original_exception, message)
          if original_exception.kind_of? DropboxError
            error_code = original_exception.http_response.code.to_i
            if error_code == 401 || error_code == 403
              raise TokenExpiredOrInvalidError.new(message, DATASOURCE_NAME)
            else
              raise AuthError.new(message)
            end
          elsif original_exception.kind_of? ArgumentError
            raise DataDownloadError.new(message, DATASOURCE_NAME)
          else
            raise original_exception
          end
        end #handle_error

        # Formats all data to comply with our desired format
        # @param item_data Hash : Single item returned from Dropbox API
        # @return { :id, :title, :url, :service, :size }
        def format_item_data(item_data)
          filename = item_data.fetch('path').split('/').last

          {
            id:       item_data.fetch('path'),
            title:    filename,
            filename: filename,
            service:  DATASOURCE_NAME,
            checksum: checksum_of(item_data.fetch('rev')),
            size:     item_data.fetch('bytes').to_i
          }
        end #format_item_data

        # Calculates a checksum of given input
        # @param origin string
        # @return string
        def checksum_of(origin)
          #noinspection RubyArgCount
          Zlib::crc32(origin).to_s
        end #checksum_of

      end #Dropbox
    end #FileProviders
  end #Syncronizer
end #CartoDB
